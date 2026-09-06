import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CACHE_COUNTER_TOKEN } from '../cache/constants/cache.tokens';
import { ICacheCounter } from '../cache/interfaces/cache.interfaces';
import { IEmailRateLimiter } from './interfaces/email.interfaces';
// ============================================================================
// CONSTANTS
// ============================================================================

/** Default maximum emails per recipient per window */
const DEFAULT_MAX_EMAILS_PER_WINDOW = 10;

/** Default rate limit window in seconds (1 hour) */
const DEFAULT_WINDOW_SECONDS = 3600;

/** Redis key namespace for email rate limits */
const RATE_LIMIT_NAMESPACE = 'email';

/** Redis key prefix within namespace */
const RATE_LIMIT_KEY_PREFIX = 'ratelimit';

// ============================================================================
// TYPES
// ============================================================================

/** Result of a rate limit check */
interface RateLimitResult {
  /** Whether the email is allowed to be sent */
  allowed: boolean;
  /** Current send count in the active window */
  currentCount: number;
  /** Maximum allowed sends per window */
  limit: number;
  /** Remaining sends available in current window */
  remaining: number;
}

// ============================================================================
// EMAIL RATE LIMIT SERVICE
// ============================================================================

/**
 * Service responsible for per-recipient email rate limiting.
 *
 * SECURITY PURPOSE:
 * Prevents email bombing attacks where an attacker triggers repeated
 * email sends to the same recipient via bulk API calls. Without this,
 * attackers can:
 * - Flood victim inboxes (denial of service)
 * - Get our sending domain blacklisted (SPF/DKIM reputation damage)
 * - Exhaust Resend API quotas (cost attack)
 *
 * DESIGN DECISIONS:
 * - Fixed-window rate limiting via Redis INCR with TTL-on-first-set
 * - Fail-open: Redis downtime won't block legitimate emails (logged as warning)
 * - SHA256-hashed keys: prevents Redis key injection from email addresses
 * - Case-insensitive: emails normalized to lowercase before hashing
 *
 * @see OWASP Email Security Cheat Sheet
 */
@Injectable()
export class EmailRateLimitService implements IEmailRateLimiter {
  private readonly logger = new Logger(EmailRateLimitService.name);
  private readonly maxPerWindow: number;
  private readonly windowSeconds: number;

  constructor(
    @Inject(CACHE_COUNTER_TOKEN) private readonly cacheCounter: ICacheCounter,
    private readonly configService: ConfigService,
  ) {
    this.maxPerWindow =
      this.configService.get<number>('EMAIL_RATE_LIMIT_MAX') ??
      DEFAULT_MAX_EMAILS_PER_WINDOW;

    this.windowSeconds =
      this.configService.get<number>('EMAIL_RATE_LIMIT_WINDOW_SECONDS') ??
      DEFAULT_WINDOW_SECONDS;

    this.logger.log(
      `Email rate limiting configured: ${this.maxPerWindow} emails per ${this.windowSeconds}s window`,
    );
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Checks if an email can be sent to the given recipient.
   * Throws TooManyRequestsException (429) if the recipient has exceeded
   * their rate limit for the current window.
   *
   * FAIL-OPEN: If Redis is unavailable (cache.incr returns 0),
   * the email is allowed through with a warning log. This prevents
   * Redis outages from blocking legitimate email sends.
   *
   * @param recipientEmail - The email address of the intended recipient
   * @throws HttpException with status 429 if rate limit exceeded
   */
  async check(recipientEmail: string): Promise<void> {
    const result = await this.evaluateRateLimit(recipientEmail);

    if (!result.allowed) {
      this.logger.warn(
        `Rate limit exceeded for recipient ${this.maskEmail(recipientEmail)}: ` +
          `${result.currentCount}/${result.limit} in current window`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Too many emails sent to this recipient. Please try again later.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Returns the remaining email quota for a recipient in the current window.
   * Useful for logging, debugging, and response headers.
   *
   * @param recipientEmail - The email address to check quota for
   * @returns Number of remaining sends allowed (0 if exhausted, -1 if Redis unavailable)
   */
  async remaining(recipientEmail: string): Promise<number> {
    const nowSeconds = Date.now() / 1000;
    const bucket = Math.floor(nowSeconds / this.windowSeconds);
    const baseKey = this.buildRateLimitKey(recipientEmail);

    // Read-only: must NOT increment, and must use the same weighted estimate as
    // `check` or the two would disagree about the same recipient.
    const currentCount = await this.cacheCounter.getCounter(
      `${baseKey}:${bucket}`,
      { namespace: RATE_LIMIT_NAMESPACE },
    );

    const estimate = await this.estimateUsage(
      baseKey,
      bucket,
      nowSeconds,
      currentCount,
    );

    // getCounter returns 0 for both "no sends yet" and "Redis down"
    // In both cases, returning full quota is the correct fail-open behavior
    return Math.max(0, Math.floor(this.maxPerWindow - estimate));
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Evaluates the rate limit for a recipient without throwing.
   * Increments the counter atomically and returns the result.
   */
  private async evaluateRateLimit(
    recipientEmail: string,
  ): Promise<RateLimitResult> {
    const nowSeconds = Date.now() / 1000;
    const bucket = Math.floor(nowSeconds / this.windowSeconds);
    const baseKey = this.buildRateLimitKey(recipientEmail);

    // Atomic increment on the CURRENT bucket. TTL is 2× the window so the
    // bucket survives long enough to serve as "previous" for the next one.
    const currentCount = await this.cacheCounter.incr(
      `${baseKey}:${bucket}`,
      { ttl: this.windowSeconds * 2, namespace: RATE_LIMIT_NAMESPACE },
    );

    // FAIL-OPEN: cache.incr() returns 0 when Redis is unavailable.
    // We treat this as "under limit" to avoid blocking legitimate emails.
    if (currentCount === 0) {
      this.logger.warn(
        'Redis unavailable for email rate limiting — failing open (email allowed)',
      );
      return {
        allowed: true,
        currentCount: 0,
        limit: this.maxPerWindow,
        remaining: this.maxPerWindow,
      };
    }

    const estimate = await this.estimateUsage(
      baseKey,
      bucket,
      nowSeconds,
      currentCount,
    );

    return {
      allowed: estimate <= this.maxPerWindow,
      currentCount: Math.ceil(estimate),
      limit: this.maxPerWindow,
      remaining: Math.max(0, Math.floor(this.maxPerWindow - estimate)),
    };
  }

  /**
   * Weighted two-bucket sliding-window estimate.
   *
   * WHY NOT THE FIXED WINDOW THIS REPLACES: a fixed window resets hard on the
   * boundary, so a sender could land `maxPerWindow` at 11:59:59 and another
   * full `maxPerWindow` at 12:00:00 — 2× the configured limit inside two
   * seconds. For an anti-email-bombing control that is the whole ballgame.
   *
   * The approximation: assume the previous bucket's sends were spread evenly,
   * and count the fraction of it still inside the trailing window.
   *
   *   t=0.00 into window → previous bucket counts 100%
   *   t=0.75 into window → previous bucket counts  25%
   *
   * COST: O(1), two Redis round trips, two integer keys per recipient. A true
   * sliding LOG (sorted set of timestamps) would be exact but costs O(n) memory
   * per recipient and needs `zremrangebyscore`/`zcard`, which `ICacheSortedSet`
   * does not expose.
   *
   * ⛔ `ICacheCounter.incrWithRollingWindow` is NOT the tool for this despite
   * the name — it pipelines INCR+EXPIRE, refreshing the TTL on every hit, so a
   * steady sender's key never expires and they are locked out permanently.
   *
   * ponytail: weighted approximation assumes uniform arrival within the
   * previous bucket. Worst case it over-admits when a burst sat at the very
   * start of that bucket. Upgrade to a sorted-set sliding log if exactness
   * ever matters more than two integer keys.
   */
  private async estimateUsage(
    baseKey: string,
    bucket: number,
    nowSeconds: number,
    currentCount: number,
  ): Promise<number> {
    const previousCount = await this.cacheCounter.getCounter(
      `${baseKey}:${bucket - 1}`,
      { namespace: RATE_LIMIT_NAMESPACE },
    );

    if (previousCount <= 0) return currentCount;

    const elapsedInWindow = nowSeconds % this.windowSeconds;
    const previousWeight = 1 - elapsedInWindow / this.windowSeconds;

    return currentCount + previousCount * previousWeight;
  }

  /**
   * Builds a Redis key for the given recipient email.
   *
   * SECURITY:
   * - Email is normalized to lowercase + trimmed (case-insensitive matching)
   * - SHA256 hash prevents Redis key injection from specially crafted emails
   *   (e.g., emails containing ":" or newline characters)
   *
   * Key format: `ratelimit:{sha256hash}` — the caller appends `:{bucket}`.
   * Full key with namespace: `email:ratelimit:{sha256hash}:{bucket}`
   */
  private buildRateLimitKey(email: string): string {
    const normalized = email.toLowerCase().trim();
    const hash = createHash('sha256').update(normalized).digest('hex');
    return `${RATE_LIMIT_KEY_PREFIX}:${hash}`;
  }

  /**
   * Masks an email address for safe logging.
   * `test@example.com` → `t***@example.com`
   *
   * SECURITY: Prevents full email addresses from appearing in logs,
   * which could be scraped from log aggregation systems.
   */
  private maskEmail(email: string): string {
    const atIndex = email.indexOf('@');
    if (atIndex <= 1) return '***@***';
    return `${email[0]}***${email.substring(atIndex)}`;
  }
}

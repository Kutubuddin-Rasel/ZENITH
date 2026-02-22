import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CacheService } from '../cache/cache.service';

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
export class EmailRateLimitService {
  private readonly logger = new Logger(EmailRateLimitService.name);
  private readonly maxPerWindow: number;
  private readonly windowSeconds: number;

  constructor(
    private readonly cacheService: CacheService,
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
   * FAIL-OPEN: If Redis is unavailable (CacheService.incr returns 0),
   * the email is allowed through with a warning log. This prevents
   * Redis outages from blocking legitimate email sends.
   *
   * @param recipientEmail - The email address of the intended recipient
   * @throws HttpException with status 429 if rate limit exceeded
   */
  async checkRateLimit(recipientEmail: string): Promise<void> {
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
  async getRemainingQuota(recipientEmail: string): Promise<number> {
    const key = this.buildRateLimitKey(recipientEmail);
    const currentCount = await this.cacheService.getCounter(key, {
      namespace: RATE_LIMIT_NAMESPACE,
    });

    // getCounter returns 0 for both "no sends yet" and "Redis down"
    // In both cases, returning full quota is the correct fail-open behavior
    return Math.max(0, this.maxPerWindow - currentCount);
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
    const key = this.buildRateLimitKey(recipientEmail);

    // Atomic increment with TTL on first set (fixed window)
    const currentCount = await this.cacheService.incr(key, {
      ttl: this.windowSeconds,
      namespace: RATE_LIMIT_NAMESPACE,
    });

    // FAIL-OPEN: CacheService.incr() returns 0 when Redis is unavailable.
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

    const allowed = currentCount <= this.maxPerWindow;
    const remaining = Math.max(0, this.maxPerWindow - currentCount);

    return {
      allowed,
      currentCount,
      limit: this.maxPerWindow,
      remaining,
    };
  }

  /**
   * Builds a Redis key for the given recipient email.
   *
   * SECURITY:
   * - Email is normalized to lowercase + trimmed (case-insensitive matching)
   * - SHA256 hash prevents Redis key injection from specially crafted emails
   *   (e.g., emails containing ":" or newline characters)
   *
   * Key format: `ratelimit:{sha256hash}`
   * Full key with namespace: `email:ratelimit:{sha256hash}`
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

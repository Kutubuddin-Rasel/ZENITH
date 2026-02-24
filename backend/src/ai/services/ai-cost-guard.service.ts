/**
 * AI Cost Guard Service — Per-Tenant Daily AI Usage Limiter
 *
 * Uses Redis atomic INCR to track and cap AI API calls per organization
 * per day. This prevents the "Wallet Drain" attack where 500 users in
 * one org each make legitimate per-user rate-limited calls, together
 * exhausting the API budget.
 *
 * FAIL-OPEN STRATEGY (Business Continuity):
 *   If Redis is unavailable, the guard ALLOWS the request and logs a
 *   warning. Rationale: a temporary Redis outage should not disable AI
 *   features for all users. The IP-based @Throttle on controllers still
 *   provides secondary defense. Fail-closed would cause cascading 503s
 *   during Redis maintenance windows.
 *
 * KEY DESIGN:
 *   ai:usage:{tenantId}:{yyyy-mm-dd}
 *   TTL: 86400s (auto-expires at end of UTC day)
 *   Op:  Redis INCR (atomic, no race conditions)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../cache/cache.service';

/** Redis namespace for AI usage counters. */
const COST_GUARD_NAMESPACE = 'ai';

/** Default daily AI calls per tenant if not configured. */
const DEFAULT_DAILY_LIMIT = 1000;

/** TTL for daily counter keys (24 hours in seconds). */
const DAY_TTL_SECONDS = 86400;

/** Result of a quota check. */
export interface QuotaCheckResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Current usage count after this request. */
  current: number;
  /** Configured daily limit. */
  limit: number;
  /** Remaining calls. 0 if limit exceeded. */
  remaining: number;
}

@Injectable()
export class AICostGuardService {
  private readonly logger = new Logger(AICostGuardService.name);
  private readonly dailyLimit: number;

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {
    this.dailyLimit = this.configService.get<number>(
      'TENANT_AI_DAILY_LIMIT',
      DEFAULT_DAILY_LIMIT,
    );

    this.logger.log(
      `Tenant AI daily limit configured: ${this.dailyLimit} calls/day`,
    );
  }

  /**
   * Check tenant quota and atomically increment the counter.
   *
   * Uses Redis INCR which is atomic — no race conditions even under
   * high concurrency. TTL is set on first increment (value === 1)
   * via CacheService.incr() behavior.
   *
   * FAIL-OPEN: If Redis returns 0 (connection failure), the request
   * is allowed to proceed. @Throttle provides backup defense.
   *
   * @param tenantId - Organization ID from JWT
   * @returns QuotaCheckResult with allowed/current/limit/remaining
   */
  async checkAndIncrement(tenantId: string): Promise<QuotaCheckResult> {
    const dateKey = this.getTodayKey();
    const redisKey = `usage:${tenantId}:${dateKey}`;

    try {
      const current = await this.cacheService.incr(redisKey, {
        namespace: COST_GUARD_NAMESPACE,
        ttl: DAY_TTL_SECONDS,
      });

      // CacheService.incr() returns 0 on Redis failure → fail-open
      if (current === 0) {
        this.logger.warn(
          `Redis unavailable for tenant cost guard — failing open for ${tenantId}`,
        );
        return {
          allowed: true,
          current: 0,
          limit: this.dailyLimit,
          remaining: this.dailyLimit,
        };
      }

      const allowed = current <= this.dailyLimit;
      const remaining = Math.max(0, this.dailyLimit - current);

      if (!allowed) {
        this.logger.warn(
          `Tenant ${tenantId} exceeded daily AI limit: ${current}/${this.dailyLimit}`,
        );
      }

      return { allowed, current, limit: this.dailyLimit, remaining };
    } catch (error: unknown) {
      // Defensive: catch any unexpected error and fail-open
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Cost guard check failed for ${tenantId}: ${message} — failing open`,
      );
      return {
        allowed: true,
        current: 0,
        limit: this.dailyLimit,
        remaining: this.dailyLimit,
      };
    }
  }

  /**
   * Get today's date key in UTC for Redis key construction.
   * Format: yyyy-mm-dd (e.g., "2026-02-24")
   */
  private getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_COUNTER_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheCounter } from '../../cache/interfaces/cache.interfaces';
import type {
  IRateLimiter,
  RateLimitOptions,
  RateLimitResult,
} from '../interfaces/performance.interfaces';
import { Response } from 'express';

/**
 * RateLimiterService — Atomic Rate Limiting via Redis INCR.
 *
 * SRP: Owns sliding-window rate limiting and rate-limit response headers.
 * Uses atomic Redis INCR for concurrency-safe counting.
 *
 * **Concurrency Strategy:**
 * Uses Redis INCR which is atomic at the database level. Even if 1000
 * concurrent requests hit this code simultaneously:
 * - Each INCR operation is serialized by Redis
 * - Each request gets its unique incremented value
 * - No race condition: can't have two requests both see "99" and both pass
 *
 * **Fail Open Strategy:**
 * If Redis is down, allow request (log error). This prevents total
 * service outage during Redis failures. For financial/critical limits,
 * change to fail closed.
 */
@Injectable()
export class RateLimiterService implements IRateLimiter {
  private readonly logger = new Logger(RateLimiterService.name);

  constructor(
    @Inject(CACHE_COUNTER_TOKEN)
    private readonly cacheCounter: ICacheCounter,
  ) {}

  /**
   * Rate limiting check using atomic Redis INCR.
   */
  async checkRateLimit(
    identifier: string,
    options: RateLimitOptions,
  ): Promise<RateLimitResult> {
    const key = `rate_limit:${identifier}`;
    const now = Date.now();
    const ttlSeconds = Math.ceil(options.windowMs / 1000);

    try {
      // ATOMIC: Increment and get new value in one Redis operation
      // cache.incr() sets TTL only on first request (value === 1)
      const currentCount = await this.cacheCounter.incr(key, {
        ttl: ttlSeconds,
        namespace: 'rate_limit',
      });

      // Check if limit exceeded AFTER incrementing
      // This is the key insight: we've already reserved our slot
      if (currentCount > options.max) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: now + options.windowMs,
        };
      }

      return {
        allowed: true,
        remaining: options.max - currentCount,
        resetTime: now + options.windowMs,
      };
    } catch (error: unknown) {
      // Fail open: Allow request if Redis is down
      this.logger.error(
        `Rate limit check failed for ${identifier}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return {
        allowed: true,
        remaining: options.max,
        resetTime: now + options.windowMs,
      };
    }
  }

  /**
   * Set rate limit headers on the response.
   */
  setRateLimitHeaders(
    res: Response,
    remaining: number,
    resetTime: number,
    limit: number,
  ): void {
    res.set({
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(resetTime).toISOString(),
    });
  }
}

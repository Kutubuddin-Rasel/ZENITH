import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CACHE_COUNTER_TOKEN,
  CACHE_STORE_TOKEN,
} from '../../../cache/constants/cache.tokens';
import {
  ICacheCounter,
  ICacheStore,
} from '../../../cache/interfaces/cache.interfaces';
import { CSRF_CONFIG_TOKEN } from '../constants/csrf.tokens';
import {
  CsrfFailureRecord,
  ICsrfConfig,
  ICsrfRateLimiter,
} from '../interfaces/csrf.interfaces';

const FAILURE_KEY_PREFIX = 'csrf_fail:';
const BAN_KEY_PREFIX = 'csrf_ban:';

/**
 * Penalty-box rate limiter for repeat CSRF failures.
 *
 * ATOMIC INCR+EXPIRE INVARIANT: `recordFailure` issues `incr` then
 * conditionally `expire`. Both calls live in this single method on
 * purpose — splitting them across services would let a Redis crash
 * between calls leave an immortal counter (key with no TTL). If you
 * refactor, KEEP THE PAIR TOGETHER.
 *
 * FAIL-OPEN SEMANTICS: both methods swallow Redis errors and return
 * permissive values (`isBanned → false`, `recordFailure → { 0, false }`).
 * Rationale: a cache outage must NOT degrade legitimate traffic to 429.
 * The audit trail still records the validation failure itself via
 * `ICsrfAuditor`; the missed counter increment is acceptable collateral.
 *
 * When `failureCount` reaches the configured threshold, this service
 * writes the ban key with `banDurationSeconds` TTL. `banTriggered` in
 * the return record lets the guard log "ban activated" without a
 * second Redis round-trip.
 */
@Injectable()
export class CsrfRateLimiterService extends ICsrfRateLimiter {
  private readonly logger = new Logger(CsrfRateLimiterService.name);

  constructor(
    @Inject(CACHE_COUNTER_TOKEN) private readonly cacheCounter: ICacheCounter,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
    @Inject(CSRF_CONFIG_TOKEN) private readonly config: ICsrfConfig,
  ) {
    super();
  }

  async isBanned(clientIp: string): Promise<boolean> {
    try {
      const banned = await this.cacheStore.get<string>(this.banKey(clientIp));
      return banned === '1';
    } catch (error) {
      this.logger.error('Redis error checking CSRF ban', error);
      return false;
    }
  }

  async recordFailure(clientIp: string): Promise<CsrfFailureRecord> {
    try {
      const failKey = this.failKey(clientIp);
      const failureCount = await this.cacheCounter.incr(failKey);

      if (failureCount === 1) {
        await this.cacheStore.expire(failKey, this.config.failureWindowSeconds);
      }

      let banTriggered = false;
      if (failureCount >= this.config.failureThreshold) {
        banTriggered = await this.triggerBan(clientIp, failureCount);
      }

      this.logger.debug(
        `CSRF failure count for ${clientIp}: ${failureCount}/${this.config.failureThreshold}`,
      );
      return { failureCount, banTriggered };
    } catch (error) {
      this.logger.error('Redis error tracking CSRF failure', error);
      return { failureCount: 0, banTriggered: false };
    }
  }

  private async triggerBan(
    clientIp: string,
    failureCount: number,
  ): Promise<boolean> {
    try {
      await this.cacheStore.set(this.banKey(clientIp), '1', {
        ttl: this.config.banDurationSeconds,
      });
      this.logger.warn(
        `CSRF BAN TRIGGERED: ${clientIp} after ${failureCount} failures. Banned for ${this.config.banDurationSeconds}s`,
      );
      return true;
    } catch (error) {
      this.logger.error('Failed to set CSRF ban', error);
      return false;
    }
  }

  private failKey(clientIp: string): string {
    return `${FAILURE_KEY_PREFIX}${clientIp}`;
  }

  private banKey(clientIp: string): string {
    return `${BAN_KEY_PREFIX}${clientIp}`;
  }
}

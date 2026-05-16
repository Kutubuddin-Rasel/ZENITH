import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  CACHE_COUNTER_TOKEN,
  CACHE_STORE_TOKEN,
} from '../../../cache/constants/cache.tokens';
import type {
  ICacheCounter,
  ICacheStore,
} from '../../../cache/interfaces/cache.interfaces';
import type { IFailureTracker } from '../../interfaces/alerting.interfaces';

const FAILURE_KEY_PREFIX = 'alert:failures:';
const FAILURE_WINDOW_SECONDS = 600;

/**
 * RedisFailureTrackerProvider
 *
 * SRP: Distributed sync-failure counter. Uses Redis `INCR` with a
 * 10-minute rolling TTL so the counter is consistent across pods and
 * resets automatically on quiet periods.
 *
 * Both cache dependencies are `@Optional()` so unit tests and isolated
 * loads degrade gracefully (returns 0 / no-op) instead of throwing.
 */
@Injectable()
export class RedisFailureTrackerProvider implements IFailureTracker {
  private readonly logger = new Logger(RedisFailureTrackerProvider.name);

  constructor(
    @Optional()
    @Inject(CACHE_COUNTER_TOKEN)
    private readonly cacheCounter?: ICacheCounter,
    @Optional()
    @Inject(CACHE_STORE_TOKEN)
    private readonly cacheStore?: ICacheStore,
  ) {
    if (this.cacheStore) {
      this.logger.log('Distributed failure tracking enabled (Redis-backed)');
    } else {
      this.logger.warn(
        'Cache store not available, failure tracking disabled (returns 0)',
      );
    }
  }

  async recordFailure(integrationId: string): Promise<number> {
    if (!this.cacheCounter) {
      this.logger.warn(
        `Integration ${integrationId} sync failed (tracking unavailable)`,
      );
      return 0;
    }
    const count = await this.cacheCounter.incrWithRollingWindow(
      `${FAILURE_KEY_PREFIX}${integrationId}`,
      FAILURE_WINDOW_SECONDS,
      { namespace: 'alerts' },
    );
    this.logger.warn(
      `Integration ${integrationId} has ${count} failures (distributed, 10min window)`,
    );
    return count;
  }

  async recordSuccess(integrationId: string): Promise<void> {
    if (!this.cacheStore) return;
    await this.cacheStore.del(`${FAILURE_KEY_PREFIX}${integrationId}`, {
      namespace: 'alerts',
    });
    this.logger.debug(`Reset failure counter for ${integrationId}`);
  }

  async getCount(integrationId: string): Promise<number> {
    if (!this.cacheCounter) return 0;
    return this.cacheCounter.getCounter(
      `${FAILURE_KEY_PREFIX}${integrationId}`,
      { namespace: 'alerts' },
    );
  }
}

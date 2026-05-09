import { Inject, Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import { ICacheStore } from '../../cache/interfaces/cache.interfaces';
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const startTime = Date.now();

      // Use cache service ping via set/get pattern
      const testKey = 'health:ping';
      const testValue = 'pong';
      const setResult = await this.cacheStore.set(testKey, testValue, { ttl: 10 });

      if (!setResult) {
        throw new Error('Redis set operation failed');
      }

      const result = await this.cacheStore.get<string>(testKey);
      const latency = Date.now() - startTime;

      if (result !== testValue) {
        throw new Error('Redis ping/pong mismatch');
      }

      return this.getStatus(key, true, { latency: `${latency}ms` });
    } catch (error) {
      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false, {
          message: (error as Error).message,
        }),
      );
    }
  }
}

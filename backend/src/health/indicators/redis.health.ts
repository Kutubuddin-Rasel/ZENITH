import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly cache: CacheService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const startTime = Date.now();

      // Use cache service ping via set/get pattern
      const testKey = 'health:ping';
      const testValue = 'pong';
      const setResult = await this.cache.set(testKey, testValue, { ttl: 10 });

      if (!setResult) {
        throw new Error('Redis set operation failed');
      }

      const result = await this.cache.get<string>(testKey);
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

import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { CACHE_CLIENT_TOKEN } from '../constants/cache.tokens';
import {
  CacheOptions,
  ICacheCounter,
} from '../interfaces/cache.interfaces';
import { buildCacheKey } from '../utils/cache-key.util';

/**
 * RedisCacheCounter — atomic counter provider implementing `ICacheCounter`.
 *
 * `incr` / `decr` set TTL only when crossing the create boundary (value 1 / -1)
 * so subsequent increments don't silently extend the window. Use
 * `incrWithRollingWindow` for distributed failure tracking where every
 * increment should refresh the expiration.
 *
 * FAIL-OPEN: returns 0 on Redis outage (callers like rate-limit fail-open).
 */
@Injectable()
export class RedisCacheCounter implements ICacheCounter {
  private readonly logger = new Logger(RedisCacheCounter.name);

  constructor(@Inject(CACHE_CLIENT_TOKEN) private readonly client: Redis) {}

  private isReady(): boolean {
    return this.client.status === 'ready';
  }

  async incr(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isReady()) return 0;
    try {
      const fullKey = buildCacheKey(key, options);
      const value = await this.client.incr(fullKey);
      if (value === 1 && options?.ttl) {
        await this.client.expire(fullKey, options.ttl);
      }
      return value;
    } catch (error: unknown) {
      this.logger.error(
        `Error incr ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return 0;
    }
  }

  async decr(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isReady()) return 0;
    try {
      const fullKey = buildCacheKey(key, options);
      const value = await this.client.decr(fullKey);
      if (value === -1 && options?.ttl) {
        await this.client.expire(fullKey, options.ttl);
      }
      return value;
    } catch (error: unknown) {
      this.logger.error(
        `Error decr ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return 0;
    }
  }

  async incrWithRollingWindow(
    key: string,
    ttlSeconds: number,
    options?: CacheOptions,
  ): Promise<number> {
    if (!this.isReady()) return 0;
    try {
      const fullKey = buildCacheKey(key, options);
      const pipeline = this.client.pipeline();
      pipeline.incr(fullKey);
      pipeline.expire(fullKey, ttlSeconds);
      const results = await pipeline.exec();
      if (results?.[0]?.[1] !== undefined) {
        return results[0][1] as number;
      }
      return 0;
    } catch (error: unknown) {
      this.logger.error(
        `Error rolling-window incr ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return 0;
    }
  }

  async getCounter(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isReady()) return 0;
    try {
      const fullKey = buildCacheKey(key, options);
      const value = await this.client.get(fullKey);
      return value ? parseInt(value, 10) : 0;
    } catch (error: unknown) {
      this.logger.error(
        `Error getting counter ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return 0;
    }
  }
}

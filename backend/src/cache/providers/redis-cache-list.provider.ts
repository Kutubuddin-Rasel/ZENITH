import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { CACHE_CLIENT_TOKEN } from '../constants/cache.tokens';
import {
  CacheOptions,
  ICacheList,
} from '../interfaces/cache.interfaces';
import { buildCacheKey } from '../utils/cache-key.util';

/**
 * RedisCacheList — list / queue primitives implementing `ICacheList`.
 *
 * Values are JSON-serialized on push and parsed on range read so callers can
 * push typed payloads without thinking about encoding.
 */
@Injectable()
export class RedisCacheList implements ICacheList {
  private readonly logger = new Logger(RedisCacheList.name);

  constructor(@Inject(CACHE_CLIENT_TOKEN) private readonly client: Redis) {}

  private isReady(): boolean {
    return this.client.status === 'ready';
  }

  async lpush<T>(
    key: string,
    value: T,
    options?: CacheOptions,
  ): Promise<number> {
    if (!this.isReady()) return 0;
    try {
      const fullKey = buildCacheKey(key, options);
      const serialized = JSON.stringify(value);
      const length = await this.client.lpush(fullKey, serialized);
      if (options?.ttl) {
        await this.client.expire(fullKey, options.ttl);
      }
      return length;
    } catch (error: unknown) {
      this.logger.error(
        `Error lpush to ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return 0;
    }
  }

  async rpush<T>(
    key: string,
    value: T,
    options?: CacheOptions,
  ): Promise<number> {
    if (!this.isReady()) return 0;
    try {
      const fullKey = buildCacheKey(key, options);
      const serialized = JSON.stringify(value);
      const length = await this.client.rpush(fullKey, serialized);
      if (options?.ttl) {
        await this.client.expire(fullKey, options.ttl);
      }
      return length;
    } catch (error: unknown) {
      this.logger.error(
        `Error rpush to ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return 0;
    }
  }

  async lrange<T>(
    key: string,
    start: number,
    stop: number,
    options?: CacheOptions,
  ): Promise<T[]> {
    if (!this.isReady()) return [];
    try {
      const fullKey = buildCacheKey(key, options);
      const items = await this.client.lrange(fullKey, start, stop);
      return items.map((item) => JSON.parse(item) as T);
    } catch (error: unknown) {
      this.logger.error(
        `Error lrange from ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return [];
    }
  }

  async llen(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isReady()) return 0;
    try {
      const fullKey = buildCacheKey(key, options);
      return await this.client.llen(fullKey);
    } catch (error: unknown) {
      this.logger.error(
        `Error llen for ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return 0;
    }
  }
}

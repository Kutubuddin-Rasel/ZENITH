import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { CACHE_CLIENT_TOKEN } from '../constants/cache.tokens';
import {
  CacheOptions,
  ICacheSortedSet,
} from '../interfaces/cache.interfaces';
import { buildCacheKey } from '../utils/cache-key.util';

/**
 * RedisCacheSortedSet — sorted-set provider implementing `ICacheSortedSet`.
 *
 * Backs O(log N) leaderboards (gamification XP). Score parsing handles
 * ioredis's flat `[member, score, ...]` reply via `zrevrange WITHSCORES`.
 */
@Injectable()
export class RedisCacheSortedSet implements ICacheSortedSet {
  private readonly logger = new Logger(RedisCacheSortedSet.name);

  constructor(@Inject(CACHE_CLIENT_TOKEN) private readonly client: Redis) {}

  private isReady(): boolean {
    return this.client.status === 'ready';
  }

  async zadd(
    key: string,
    score: number,
    member: string,
    options?: CacheOptions,
  ): Promise<boolean> {
    if (!this.isReady()) return false;
    try {
      const fullKey = buildCacheKey(key, options);
      await this.client.zadd(fullKey, score, member);
      return true;
    } catch (error: unknown) {
      this.logger.error(
        `Error zadd ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    }
  }

  async zrevrangeWithScores(
    key: string,
    start: number,
    stop: number,
    options?: CacheOptions,
  ): Promise<{ member: string; score: number }[]> {
    if (!this.isReady()) return [];
    try {
      const fullKey = buildCacheKey(key, options);
      const flat = await this.client.zrevrange(
        fullKey,
        start,
        stop,
        'WITHSCORES',
      );
      const entries: { member: string; score: number }[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        entries.push({
          member: flat[i],
          score: parseFloat(flat[i + 1]),
        });
      }
      return entries;
    } catch (error: unknown) {
      this.logger.error(
        `Error zrevrange ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return [];
    }
  }

  async zrevrank(
    key: string,
    member: string,
    options?: CacheOptions,
  ): Promise<number | null> {
    if (!this.isReady()) return null;
    try {
      const fullKey = buildCacheKey(key, options);
      return await this.client.zrevrank(fullKey, member);
    } catch (error: unknown) {
      this.logger.error(
        `Error zrevrank ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return null;
    }
  }

  async zscore(
    key: string,
    member: string,
    options?: CacheOptions,
  ): Promise<number | null> {
    if (!this.isReady()) return null;
    try {
      const fullKey = buildCacheKey(key, options);
      const score = await this.client.zscore(fullKey, member);
      return score !== null ? parseFloat(score) : null;
    } catch (error: unknown) {
      this.logger.error(
        `Error zscore ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return null;
    }
  }
}

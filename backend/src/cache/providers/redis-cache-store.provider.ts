import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import Redis from 'ioredis';
import { CACHE_CLIENT_TOKEN } from '../constants/cache.tokens';
import { CacheOptions, ICacheStore } from '../interfaces/cache.interfaces';
import { buildCacheKey, buildTagKey } from '../utils/cache-key.util';
import { CacheMetricsRecorder } from './cache-metrics-recorder';
import { CIRCUIT_BREAKER_EXECUTOR_TOKEN } from '../../circuit-breaker/constants/circuit-breaker.tokens';
import type { ICircuitBreakerExecutor } from '../../circuit-breaker/interfaces/circuit-breaker.interfaces';

/**
 * RedisCacheStore — primitive K/V provider implementing `ICacheStore`.
 *
 * SCOPE (single responsibility):
 *  - Get/Set/Del/Exists/Expire/TTL on the shared ioredis client.
 *  - JSON serialization of values written via `set`.
 *  - Tag bookkeeping when `options.tags` is provided (registers the cache key
 *    in `tag:{tagName}` Redis sets so `RedisCacheInvalidator` can fan out).
 *
 * CIRCUIT BREAKER (lazy resolution):
 *  Get/Set are wrapped through `ICircuitBreakerExecutor` so a Redis
 *  outage doesn't take application latency down with it. The executor
 *  is resolved lazily via `ModuleRef` in `onModuleInit` — NOT injected
 *  via the constructor — because `CircuitBreakerModule` itself imports
 *  `CacheModule` (the breaker needs `CACHE_STORE_TOKEN` for cross-pod
 *  state replication). A constructor injection here would create a hard
 *  `cache → breaker → cache` DI cycle that NestJS cannot resolve.
 *
 *  Falls back to direct Redis calls when the executor cannot be resolved
 *  (test mode / breaker module disabled).
 */
@Injectable()
export class RedisCacheStore implements ICacheStore, OnModuleInit {
  private readonly logger = new Logger(RedisCacheStore.name);

  private readonly breakerConfig = {
    name: 'redis-cache',
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5,
  } as const;

  private circuitBreaker?: ICircuitBreakerExecutor;

  constructor(
    @Inject(CACHE_CLIENT_TOKEN) private readonly client: Redis,
    private readonly metrics: CacheMetricsRecorder,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    try {
      this.circuitBreaker = this.moduleRef.get<ICircuitBreakerExecutor>(
        CIRCUIT_BREAKER_EXECUTOR_TOKEN,
        { strict: false },
      );
      this.logger.log(
        'Circuit breaker executor resolved — cache reads/writes will be wrapped',
      );
    } catch {
      this.logger.warn(
        'Circuit breaker executor not available — falling back to direct Redis calls',
      );
      this.circuitBreaker = undefined;
    }
  }

  private isReady(): boolean {
    return this.client.status === 'ready';
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const namespace = options?.namespace ?? 'default';

    if (!this.isReady()) {
      this.metrics.recordMiss(namespace);
      return null;
    }

    const endTimer = this.metrics.startTimer('get');

    const action = async (): Promise<T | null> => {
      const fullKey = buildCacheKey(key, options);
      const value = await this.client.get(fullKey);
      if (value === null) {
        return null;
      }
      return JSON.parse(value) as T;
    };

    const fallback = (): T | null => {
      this.logger.debug(`Circuit breaker fallback for get: ${key}`);
      return null;
    };

    let result: T | null = null;
    try {
      result = this.circuitBreaker
        ? await this.circuitBreaker.execute(
            this.breakerConfig,
            action,
            fallback,
          )
        : await action();
    } catch (error: unknown) {
      this.logger.error(
        `Error getting cache key ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      result = null;
    } finally {
      endTimer();
      if (result !== null) {
        this.metrics.recordHit(namespace);
      } else {
        this.metrics.recordMiss(namespace);
      }
    }
    return result;
  }

  async set<T>(
    key: string,
    value: T,
    options?: CacheOptions,
  ): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    const endTimer = this.metrics.startTimer('set');

    const action = async (): Promise<boolean> => {
      const fullKey = buildCacheKey(key, options);
      const serialized = JSON.stringify(value);

      const result = options?.ttl
        ? await this.client.setex(fullKey, options.ttl, serialized)
        : await this.client.set(fullKey, serialized);

      if (options?.tags?.length) {
        await this.attachTags(fullKey, options.tags);
      }
      return result === 'OK';
    };

    const fallback = (): boolean => {
      this.logger.debug(`Circuit breaker fallback for set: ${key}`);
      return false;
    };

    try {
      return this.circuitBreaker
        ? await this.circuitBreaker.execute(
            this.breakerConfig,
            action,
            fallback,
          )
        : await action();
    } catch (error: unknown) {
      this.logger.error(
        `Error setting cache key ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    } finally {
      endTimer();
    }
  }

  async del(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.isReady()) return false;
    try {
      const fullKey = buildCacheKey(key, options);
      const result = await this.client.del(fullKey);
      return result > 0;
    } catch (error: unknown) {
      this.logger.error(
        `Error deleting cache key ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    }
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.isReady()) return false;
    try {
      const fullKey = buildCacheKey(key, options);
      const result = await this.client.exists(fullKey);
      return result === 1;
    } catch (error: unknown) {
      this.logger.error(
        `Error checking cache key existence ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    }
  }

  async expire(
    key: string,
    ttlSeconds: number,
    options?: CacheOptions,
  ): Promise<boolean> {
    if (!this.isReady()) return false;
    try {
      const fullKey = buildCacheKey(key, options);
      const result = await this.client.expire(fullKey, ttlSeconds);
      return result === 1;
    } catch (error: unknown) {
      this.logger.error(
        `Error setting expiration for cache key ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    }
  }

  async ttl(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isReady()) return -1;
    try {
      const fullKey = buildCacheKey(key, options);
      return await this.client.ttl(fullKey);
    } catch (error: unknown) {
      this.logger.error(
        `Error getting TTL for cache key ${key}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return -1;
    }
  }

  /**
   * Register a cache key in each `tag:{tagName}` Redis set so the invalidator
   * can fan out by tag. Tag sets carry a 24h TTL so abandoned tags self-clean.
   */
  private async attachTags(fullKey: string, tags: string[]): Promise<void> {
    if (!this.isReady() || !tags.length) return;
    try {
      const pipeline = this.client.pipeline();
      for (const tag of tags) {
        const tagKey = buildTagKey(tag);
        pipeline.sadd(tagKey, fullKey);
        pipeline.expire(tagKey, 86400);
      }
      await pipeline.exec();
    } catch (error: unknown) {
      this.logger.error(
        `Error attaching tags to ${fullKey}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}

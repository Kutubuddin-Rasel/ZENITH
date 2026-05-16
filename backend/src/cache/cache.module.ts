import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { cacheConfig } from './config/cache.config';
import { redisConfig, RedisConfig } from './config/redis.config';
import {
  CACHE_CLIENT_TOKEN,
  CACHE_COUNTER_TOKEN,
  CACHE_HEALTH_TOKEN,
  CACHE_INVALIDATOR_TOKEN,
  CACHE_LIST_TOKEN,
  CACHE_SORTED_SET_TOKEN,
  CACHE_STORE_TOKEN,
  ENTITY_CACHE_TOKEN,
} from './constants/cache.tokens';
import { CacheMetricsRecorder } from './providers/cache-metrics-recorder';
import { EntityCacheFacade } from './providers/entity-cache.facade';
import { RedisCacheCounter } from './providers/redis-cache-counter.provider';
import { RedisCacheHealth } from './providers/redis-cache-health.provider';
import { RedisCacheInvalidator } from './providers/redis-cache-invalidator.provider';
import { RedisCacheList } from './providers/redis-cache-list.provider';
import { RedisCacheSortedSet } from './providers/redis-cache-sorted-set.provider';
import { RedisCacheStore } from './providers/redis-cache-store.provider';
import { RedisConnectionLifecycle } from './providers/redis-connection.lifecycle';
import { CacheTtlService } from './cache-ttl.service';

/**
 * CacheModule — Step 3 final encapsulation.
 *
 * RESPONSIBILITY:
 *  - Owns the single ioredis client (CACHE_CLIENT_TOKEN) constructed from the
 *    consolidated `redis` namespace.
 *  - Binds each segregated cache contract to a focused Redis* provider.
 *  - Manages connection lifecycle via `RedisConnectionLifecycle`.
 *
 * EXPORT POLICY (Zero Concrete Leaks):
 *  - Only segregated interface tokens are exported. Consumers must inject the
 *    narrowest token they need (`CACHE_STORE_TOKEN`, `CACHE_COUNTER_TOKEN`, …).
 *  - Concrete `Redis*` provider classes and `CACHE_CLIENT_TOKEN` are NOT
 *    exported — they are implementation details of this module.
 *  - The module is no longer `@Global()`: every consumer module must list
 *    `CacheModule` in its `imports` array, making the dependency boundary
 *    explicit.
 */
@Module({
  imports: [
    ConfigModule.forFeature(cacheConfig),
    ConfigModule.forFeature(redisConfig),
  ],
  providers: [
    // Lifecycle + metrics owners.
    RedisConnectionLifecycle,
    CacheMetricsRecorder,

    // Single Redis client factory — owns the ioredis connection lifecycle.
    {
      provide: CACHE_CLIENT_TOKEN,
      useFactory: (configService: ConfigService): Redis => {
        const cfg = configService.get<RedisConfig>('redis');
        if (!cfg) {
          throw new Error(
            "[CacheModule] 'redis' config namespace not registered.",
          );
        }
        return new Redis(cfg);
      },
      inject: [ConfigService],
    },

    // Segregated contract → concrete provider bindings.
    { provide: CACHE_STORE_TOKEN, useClass: RedisCacheStore },
    { provide: CACHE_INVALIDATOR_TOKEN, useClass: RedisCacheInvalidator },
    { provide: CACHE_LIST_TOKEN, useClass: RedisCacheList },
    { provide: CACHE_HEALTH_TOKEN, useClass: RedisCacheHealth },
    { provide: CACHE_COUNTER_TOKEN, useClass: RedisCacheCounter },
    { provide: CACHE_SORTED_SET_TOKEN, useClass: RedisCacheSortedSet },
    { provide: ENTITY_CACHE_TOKEN, useClass: EntityCacheFacade },

    CacheTtlService,
  ],
  exports: [
    CACHE_STORE_TOKEN,
    CACHE_INVALIDATOR_TOKEN,
    CACHE_LIST_TOKEN,
    CACHE_HEALTH_TOKEN,
    CACHE_COUNTER_TOKEN,
    CACHE_SORTED_SET_TOKEN,
    ENTITY_CACHE_TOKEN,
    CacheTtlService,
  ],
})
export class CacheModule {}

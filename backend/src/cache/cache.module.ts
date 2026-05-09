import { Global, Module } from '@nestjs/common';
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
import { CacheService } from './cache.service';
import { CacheTtlService } from './cache-ttl.service';

/**
 * CacheModule — Step 2 encapsulation.
 *
 * RESPONSIBILITY:
 *  - Owns the single ioredis client (CACHE_CLIENT_TOKEN) constructed from the
 *    consolidated `redis` namespace.
 *  - Binds each segregated cache contract to a focused Redis* provider.
 *  - Manages connection lifecycle via `RedisConnectionLifecycle`.
 *
 * EXPORT POLICY (Zero Concrete Leaks):
 *  - Only segregated interface tokens are exported.
 *  - The legacy `CacheService` and `CacheTtlService` are exported transitionally
 *    so the existing 60 consumers keep compiling. Step 3 migrates them to
 *    inject the narrowest token directly, after which `CacheService` becomes
 *    a candidate for removal.
 *  - Concrete `Redis*` provider classes and `CACHE_CLIENT_TOKEN` are NOT
 *    exported — they are implementation details of this module.
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(cacheConfig), ConfigModule.forFeature(redisConfig)],
  providers: [
    // Lifecycle + metrics owners.
    RedisConnectionLifecycle,
    CacheMetricsRecorder,

    // Single Redis client factory — replaces the inline `new Redis(...)`
    // that used to live in CacheService.onModuleInit.
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

    // Transitional legacy bridge — delegates to the segregated tokens above.
    CacheService,
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

    // Legacy bridge (transitional, removed after Step 3 consumer migration).
    CacheService,
    CacheTtlService,
  ],
})
export class CacheModule {}

import { Inject, Injectable } from '@nestjs/common';
import {
  CACHE_COUNTER_TOKEN,
  CACHE_HEALTH_TOKEN,
  CACHE_INVALIDATOR_TOKEN,
  CACHE_LIST_TOKEN,
  CACHE_SORTED_SET_TOKEN,
  CACHE_STORE_TOKEN,
  ENTITY_CACHE_TOKEN,
} from './constants/cache.tokens';
import {
  CacheOptions,
  ICacheCounter,
  ICacheHealth,
  ICacheInvalidator,
  ICacheList,
  ICacheService,
  ICacheSortedSet,
  ICacheStore,
  IEntityCache,
  RedisStats,
} from './interfaces/cache.interfaces';
import {
  CachedIssue,
  CachedProject,
  CachedUser,
} from './cache.interfaces';

export type { CacheOptions } from './interfaces/cache.interfaces';

/**
 * CacheService — TRANSITIONAL legacy bridge implementing `ICacheService`.
 *
 * @deprecated Inject the narrowest segregated token instead:
 *  - `CACHE_STORE_TOKEN` (`ICacheStore`)
 *  - `CACHE_INVALIDATOR_TOKEN` (`ICacheInvalidator`)
 *  - `CACHE_LIST_TOKEN` (`ICacheList`)
 *  - `CACHE_HEALTH_TOKEN` (`ICacheHealth`)
 *  - `CACHE_COUNTER_TOKEN` (`ICacheCounter`)
 *  - `CACHE_SORTED_SET_TOKEN` (`ICacheSortedSet`)
 *  - `ENTITY_CACHE_TOKEN` (`IEntityCache`)
 *
 * Step 3 migrates the 60 consumer files to the tokens above; once that
 * lands this class will be deleted. Do NOT add new methods here.
 *
 * The previous 800+ line god-class has been hollowed out: it now does
 * nothing but forward each call to the appropriate focused provider.
 */
@Injectable()
export class CacheService implements ICacheService {
  constructor(
    @Inject(CACHE_STORE_TOKEN) private readonly store: ICacheStore,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly invalidator: ICacheInvalidator,
    @Inject(CACHE_LIST_TOKEN) private readonly list: ICacheList,
    @Inject(CACHE_HEALTH_TOKEN) private readonly health: ICacheHealth,
    @Inject(CACHE_COUNTER_TOKEN) private readonly counter: ICacheCounter,
    @Inject(CACHE_SORTED_SET_TOKEN)
    private readonly sortedSet: ICacheSortedSet,
    @Inject(ENTITY_CACHE_TOKEN) private readonly entities: IEntityCache,
  ) {}

  // ICacheStore --------------------------------------------------------------
  get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    return this.store.get<T>(key, options);
  }
  set<T>(key: string, value: T, options?: CacheOptions): Promise<boolean> {
    return this.store.set<T>(key, value, options);
  }
  del(key: string, options?: CacheOptions): Promise<boolean> {
    return this.store.del(key, options);
  }
  exists(key: string, options?: CacheOptions): Promise<boolean> {
    return this.store.exists(key, options);
  }
  expire(
    key: string,
    ttlSeconds: number,
    options?: CacheOptions,
  ): Promise<boolean> {
    return this.store.expire(key, ttlSeconds, options);
  }
  ttl(key: string, options?: CacheOptions): Promise<number> {
    return this.store.ttl(key, options);
  }

  // ICacheInvalidator --------------------------------------------------------
  flushNamespace(namespace: string): Promise<boolean> {
    return this.invalidator.flushNamespace(namespace);
  }
  invalidateByTags(tags: string[]): Promise<boolean> {
    return this.invalidator.invalidateByTags(tags);
  }
  getKeysByTags(tags: string[]): Promise<string[]> {
    return this.invalidator.getKeysByTags(tags);
  }

  // ICacheList ---------------------------------------------------------------
  lpush<T>(key: string, value: T, options?: CacheOptions): Promise<number> {
    return this.list.lpush<T>(key, value, options);
  }
  rpush<T>(key: string, value: T, options?: CacheOptions): Promise<number> {
    return this.list.rpush<T>(key, value, options);
  }
  lrange<T>(
    key: string,
    start: number,
    stop: number,
    options?: CacheOptions,
  ): Promise<T[]> {
    return this.list.lrange<T>(key, start, stop, options);
  }
  llen(key: string, options?: CacheOptions): Promise<number> {
    return this.list.llen(key, options);
  }

  // ICacheHealth -------------------------------------------------------------
  ping(): Promise<string> {
    return this.health.ping();
  }
  isHealthy(): boolean {
    return this.health.isHealthy();
  }
  getStats(): Promise<RedisStats> {
    return this.health.getStats();
  }

  // ICacheCounter ------------------------------------------------------------
  incr(key: string, options?: CacheOptions): Promise<number> {
    return this.counter.incr(key, options);
  }
  decr(key: string, options?: CacheOptions): Promise<number> {
    return this.counter.decr(key, options);
  }
  incrWithRollingWindow(
    key: string,
    ttlSeconds: number,
    options?: CacheOptions,
  ): Promise<number> {
    return this.counter.incrWithRollingWindow(key, ttlSeconds, options);
  }
  getCounter(key: string, options?: CacheOptions): Promise<number> {
    return this.counter.getCounter(key, options);
  }

  // ICacheSortedSet ----------------------------------------------------------
  zadd(
    key: string,
    score: number,
    member: string,
    options?: CacheOptions,
  ): Promise<boolean> {
    return this.sortedSet.zadd(key, score, member, options);
  }
  zrevrangeWithScores(
    key: string,
    start: number,
    stop: number,
    options?: CacheOptions,
  ): Promise<{ member: string; score: number }[]> {
    return this.sortedSet.zrevrangeWithScores(key, start, stop, options);
  }
  zrevrank(
    key: string,
    member: string,
    options?: CacheOptions,
  ): Promise<number | null> {
    return this.sortedSet.zrevrank(key, member, options);
  }
  zscore(
    key: string,
    member: string,
    options?: CacheOptions,
  ): Promise<number | null> {
    return this.sortedSet.zscore(key, member, options);
  }

  // IEntityCache -------------------------------------------------------------
  cacheUser(
    userId: string,
    user: CachedUser,
    ttl?: number,
  ): Promise<boolean> {
    return this.entities.cacheUser(userId, user, ttl);
  }
  getCachedUser(userId: string): Promise<CachedUser | null> {
    return this.entities.getCachedUser(userId);
  }
  cacheProject(
    projectId: string,
    project: CachedProject,
    ttl?: number,
  ): Promise<boolean> {
    return this.entities.cacheProject(projectId, project, ttl);
  }
  getCachedProject(projectId: string): Promise<CachedProject | null> {
    return this.entities.getCachedProject(projectId);
  }
  cacheIssues(
    projectId: string,
    issues: CachedIssue[],
    ttl?: number,
  ): Promise<boolean> {
    return this.entities.cacheIssues(projectId, issues, ttl);
  }
  getCachedIssues(projectId: string): Promise<CachedIssue[]> {
    return this.entities.getCachedIssues(projectId);
  }
  invalidateProjectCache(projectId: string): Promise<boolean> {
    return this.entities.invalidateProjectCache(projectId);
  }
  invalidateUserCache(userId: string): Promise<boolean> {
    return this.entities.invalidateUserCache(userId);
  }
}

import { CachedIssue, CachedProject, CachedUser } from '../cache.interfaces';

/**
 * Cache Service Contracts (Cache Module — DIP/ISP foundation, Step 2 surface).
 *
 * Strict, segregated interfaces. Concrete implementations live in
 * `../providers/` and are bound to the tokens in `../constants/cache.tokens.ts`.
 * Consumers MUST inject via tokens, never the concrete classes.
 */

/**
 * Per-call cache options shared by every primitive operation.
 *
 * - `ttl`: Time-to-live in seconds.
 * - `tags`: Tag set tracked by the invalidator (`tag:{tagName}` Redis sets).
 * - `namespace`: Logical key partition (used by `flushNamespace`).
 */
export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  namespace?: string;
}

/**
 * Redis health/stats payload returned by `ICacheHealth.getStats`.
 */
export interface RedisStats {
  connected: boolean;
  memory: unknown[] | null;
  info: Record<string, unknown> | null;
  keyspace: Record<string, unknown> | null;
}

/**
 * ICacheStore — primitive K/V surface.
 * Generics enforce typed reads/writes; `null` denotes a miss.
 */
export interface ICacheStore {
  get<T>(key: string, options?: CacheOptions): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<boolean>;
  del(key: string, options?: CacheOptions): Promise<boolean>;
  exists(key: string, options?: CacheOptions): Promise<boolean>;
  expire(
    key: string,
    ttlSeconds: number,
    options?: CacheOptions,
  ): Promise<boolean>;
  ttl(key: string, options?: CacheOptions): Promise<number>;
}

/**
 * ICacheInvalidator — bulk invalidation surface.
 */
export interface ICacheInvalidator {
  flushNamespace(namespace: string): Promise<boolean>;
  invalidateByTags(tags: string[]): Promise<boolean>;
  getKeysByTags(tags: string[]): Promise<string[]>;
}

/**
 * ICacheList — Redis list / queue primitives.
 * Values are JSON-serialized; reads parse back to `T`.
 */
export interface ICacheList {
  lpush<T>(key: string, value: T, options?: CacheOptions): Promise<number>;
  rpush<T>(key: string, value: T, options?: CacheOptions): Promise<number>;
  lrange<T>(
    key: string,
    start: number,
    stop: number,
    options?: CacheOptions,
  ): Promise<T[]>;
  llen(key: string, options?: CacheOptions): Promise<number>;
}

/**
 * ICacheHealth — liveness / observability surface.
 */
export interface ICacheHealth {
  ping(): Promise<string>;
  isHealthy(): boolean;
  getStats(): Promise<RedisStats>;
}

/**
 * ICacheCounter — atomic counter primitives.
 *
 * `incrWithRollingWindow` is the rolling-window variant used for distributed
 * failure tracking (see `common/services/alert.service.ts`).
 */
export interface ICacheCounter {
  incr(key: string, options?: CacheOptions): Promise<number>;
  decr(key: string, options?: CacheOptions): Promise<number>;
  incrWithRollingWindow(
    key: string,
    ttlSeconds: number,
    options?: CacheOptions,
  ): Promise<number>;
  getCounter(key: string, options?: CacheOptions): Promise<number>;
}

/**
 * ICacheSortedSet — Redis sorted-set primitives (gamification leaderboards).
 */
export interface ICacheSortedSet {
  zadd(
    key: string,
    score: number,
    member: string,
    options?: CacheOptions,
  ): Promise<boolean>;
  zrevrangeWithScores(
    key: string,
    start: number,
    stop: number,
    options?: CacheOptions,
  ): Promise<{ member: string; score: number }[]>;
  zrevrank(
    key: string,
    member: string,
    options?: CacheOptions,
  ): Promise<number | null>;
  zscore(
    key: string,
    member: string,
    options?: CacheOptions,
  ): Promise<number | null>;
}

/**
 * IEntityCache — domain-typed cache helpers.
 *
 * Implemented by `EntityCacheFacade`; backed by `ICacheStore` +
 * `ICacheInvalidator`. Decouples application services from raw key/namespace
 * conventions for User/Project/Issue caching.
 */
export interface IEntityCache {
  cacheUser(userId: string, user: CachedUser, ttl?: number): Promise<boolean>;
  getCachedUser(userId: string): Promise<CachedUser | null>;
  cacheProject(
    projectId: string,
    project: CachedProject,
    ttl?: number,
  ): Promise<boolean>;
  getCachedProject(projectId: string): Promise<CachedProject | null>;
  cacheIssues(
    projectId: string,
    issues: CachedIssue[],
    ttl?: number,
  ): Promise<boolean>;
  getCachedIssues(projectId: string): Promise<CachedIssue[]>;
  invalidateProjectCache(projectId: string): Promise<boolean>;
  invalidateUserCache(userId: string): Promise<boolean>;
}

/**
 * ICacheService — composite façade union of every segregated interface.
 *
 * Retained for tooling that genuinely needs the full surface (e.g., generic
 * test doubles). Production code MUST inject the narrowest segregated
 * contract instead — never this façade.
 */
export interface ICacheService
  extends
    ICacheStore,
    ICacheInvalidator,
    ICacheList,
    ICacheHealth,
    ICacheCounter,
    ICacheSortedSet,
    IEntityCache {}

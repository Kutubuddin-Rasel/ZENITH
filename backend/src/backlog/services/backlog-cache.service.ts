import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * Narrow view of the cache-manager store(s).
 *
 * cache-manager v5+ holds an array of Keyv-backed stores under `stores`;
 * older single-store builds expose `store`. The Redis store optionally
 * exposes a pattern-matching `keys(pattern)` lookup. Typing it explicitly
 * lets the SCAN-based invalidation drop the legacy `(cache as any)` access
 * — the source of 10 `no-unsafe-*` lint errors in the old `BacklogService`.
 */
interface PatternableStore {
  keys?(pattern: string): Promise<string[]>;
}
interface CacheStoreInternals {
  stores?: PatternableStore[];
  store?: PatternableStore;
}

/**
 * BacklogCacheService — the module-internal cache concern.
 *
 * Owns the backlog cache-key convention (`backlog:{projectId}:p{page}:l{limit}`)
 * and the read/write/invalidate primitives shared by `BacklogQueryService`
 * (read path) and `BacklogOrderingService` (invalidation after a mutation).
 * NOT exported from the module barrel — purely an internal collaborator.
 */
@Injectable()
export class BacklogCacheService {
  /** Cache TTL in milliseconds (60 seconds). */
  private readonly CACHE_TTL = 60000;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /** Pattern: `backlog:{projectId}:p{page}:l{limit}`. */
  private getCacheKey(projectId: string, page: number, limit: number): string {
    return `backlog:${projectId}:p${page}:l${limit}`;
  }

  /** Read a cached backlog page (`null` on miss). */
  async readPage<T>(
    projectId: string,
    page: number,
    limit: number,
  ): Promise<T | null> {
    return (
      (await this.cache.get<T>(this.getCacheKey(projectId, page, limit))) ??
      null
    );
  }

  /** Cache a backlog page with the standard TTL. */
  async writePage<T>(
    projectId: string,
    page: number,
    limit: number,
    value: T,
  ): Promise<void> {
    await this.cache.set(
      this.getCacheKey(projectId, page, limit),
      value,
      this.CACHE_TTL,
    );
  }

  /**
   * Invalidate every cached backlog page for a project. Prefers a Redis
   * `keys(pattern)` SCAN when the store exposes one; otherwise falls back to
   * deleting the known page/limit grid.
   */
  async invalidate(projectId: string): Promise<void> {
    const internals = this.cache as unknown as CacheStoreInternals;
    const store = internals.stores?.[0] ?? internals.store;

    if (store && store.keys) {
      const keys = await store.keys(`backlog:${projectId}:*`);
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => this.cache.del(key)));
      }
      return;
    }

    // Fallback: clear known pages (first 10 pages with common limits).
    const limits = [50, 100, 200];
    for (let page = 1; page <= 10; page++) {
      for (const limit of limits) {
        await this.cache.del(this.getCacheKey(projectId, page, limit));
      }
    }
  }
}

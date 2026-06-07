import { Injectable } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { IPAccessRule } from '../entities/ip-access-rule.entity';
import { CacheCounters } from '../interfaces/access-control.interfaces';
import { CACHE_CONFIG } from '../constants/access-control.cache';

/**
 * Shared in-memory L1 store + hit/miss counters. Owned by a single provider
 * so the read path (AccessRuleCacheService) and the invalidation path
 * (AccessRuleCacheInvalidatorService) operate on the SAME LRU instance.
 */
@Injectable()
export class AccessRuleL1Cache {
  private readonly cache = new LRUCache<string, IPAccessRule[]>({
    max: CACHE_CONFIG.L1_MAX_SIZE,
    ttl: CACHE_CONFIG.L1_TTL_MS,
    allowStale: false,
    updateAgeOnGet: false,
  });

  readonly counters: CacheCounters = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    dbQueries: 0,
  };

  get(key: string): IPAccessRule[] | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: IPAccessRule[]): void {
    this.cache.set(key, value);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import * as crypto from 'crypto';

import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { QueryOptions } from './query-optimizer.types';

/**
 * QueryCacheService — owns the read-through cache flow for SelectQueryBuilder
 * executions: deterministic key derivation, optimization application,
 * execution, and TTL-bounded persistence. Sole owner of the SHA-256 cache-key
 * scheme.
 */
@Injectable()
export class QueryCacheService {
  private readonly logger = new Logger(QueryCacheService.name);

  constructor(
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
  ) {}

  async optimizeQuery<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<T[]> {
    const { useCache = true, cacheTtl = 300, cacheKey } = options;
    const finalCacheKey = cacheKey ?? this.buildCacheKey(qb, options);

    if (useCache) {
      const cached = await this.cacheStore.get<T[]>(finalCacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for key: ${finalCacheKey}`);
        return cached;
      }
    }

    this.applyQueryOptimizations(qb, options);

    const startTime = Date.now();
    const result = await qb.getMany();
    this.logger.debug(`Query executed in ${Date.now() - startTime}ms`);

    if (useCache && result.length > 0) {
      await this.cacheStore.set(finalCacheKey, result, { ttl: cacheTtl });
    }
    return result;
  }

  async optimizeCount<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<number> {
    const { useCache = true, cacheTtl = 300, cacheKey } = options;
    const finalCacheKey = cacheKey
      ? `${cacheKey}:count`
      : this.buildCacheKey(qb, options, 'count');

    if (useCache) {
      const cached = await this.cacheStore.get<number>(finalCacheKey);
      if (cached !== null) return cached;
    }

    qb.select('COUNT(*)', 'count');

    const startTime = Date.now();
    const raw = (await qb.getRawOne()) as { count: string };
    this.logger.debug(`Count query executed in ${Date.now() - startTime}ms`);

    const count = parseInt(raw.count, 10);
    if (useCache) {
      await this.cacheStore.set(finalCacheKey, count, { ttl: cacheTtl });
    }
    return count;
  }

  async warmUpCache<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<void> {
    this.logger.log('Warming up cache...');
    try {
      await this.optimizeQuery(qb, {
        ...options,
        useCache: true,
        cacheTtl: 3600,
      });
      this.logger.log('Cache warmed up successfully');
    } catch (error) {
      this.logger.error('Failed to warm up cache:', error);
    }
  }

  /**
   * Public so QueryAnalyzerService can derive the same key the cache layer
   * uses (avoids duplicated hashing logic).
   */
  buildCacheKey<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    _options: QueryOptions,
    suffix: 'data' | 'count' = 'data',
  ): string {
    const sql = qb.getSql();
    const parameters = qb.getParameters();
    const queryHash = this.hashString(`${sql}:${JSON.stringify(parameters)}`);
    return `query:${suffix}:${queryHash}`;
  }

  private applyQueryOptimizations<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: QueryOptions,
  ): void {
    const { select, relations, where, order, limit } = options;

    if (select && select.length > 0) qb.select(select);

    if (relations && relations.length > 0) {
      relations.forEach((relation) => {
        qb.leftJoinAndSelect(relation, relation.split('.')[1]);
      });
    }

    if (where) qb.where(where);

    if (order) {
      Object.entries(order).forEach(([field, direction]) => {
        qb.addOrderBy(field, direction);
      });
    }

    if (limit) qb.limit(limit);

    this.addPerformanceHints(qb);
  }

  private addPerformanceHints<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
  ): void {
    const sql = qb.getSql();

    if (sql.includes('SELECT') && !sql.includes('LIMIT')) {
      this.logger.warn(
        'Query without LIMIT detected - consider adding pagination',
      );
    }

    if (sql.includes('WHERE') && sql.includes('projectId')) {
      this.logger.debug('Query with projectId filter - should use index');
    }
  }

  /**
   * SHA-256 hash truncated to 16 hex chars (64 bits) — acceptable for cache
   * key disambiguation; replaces a prior weak DJB2-style hash.
   */
  private hashString(str: string): string {
    return crypto
      .createHash('sha256')
      .update(str)
      .digest('hex')
      .substring(0, 16);
  }
}

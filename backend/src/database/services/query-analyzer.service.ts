import { Inject, Injectable } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { QueryCacheService } from './query-cache.service';
import {
  QueryAnalysisResult,
  QueryOptions,
  QueryPlanResult,
} from './query-optimizer.types';

/**
 * QueryAnalyzerService — owns the EXPLAIN-style introspection and
 * post-execution heuristics (cache-hit reporting, slow-query detection,
 * SELECT * recommendations). Reuses QueryCacheService for execution so the
 * analyzer never duplicates the cache pathway.
 */
@Injectable()
export class QueryAnalyzerService {
  constructor(
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
    private readonly queryCache: QueryCacheService,
  ) {}

  getQueryPlan<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
  ): Promise<QueryPlanResult> {
    return Promise.resolve({
      sql: qb.getSql(),
      parameters: qb.getParameters(),
    });
  }

  async analyzeQuery<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<QueryAnalysisResult> {
    const startTime = Date.now();
    const cacheKey = this.queryCache.buildCacheKey(qb, options);

    const cached = await this.cacheStore.get<T[]>(cacheKey);
    const cacheHit = cached !== null;

    const result: T[] =
      cacheHit && cached
        ? cached
        : await this.queryCache.optimizeQuery(qb, options);

    const executionTime = Date.now() - startTime;
    const recommendations: string[] = [];

    if (executionTime > 1000) {
      recommendations.push(
        'Query execution time is high - consider adding indexes or optimizing the query',
      );
    }

    if (!cacheHit && result.length > 100) {
      recommendations.push(
        'Large result set without cache - consider implementing pagination',
      );
    }

    if (qb.getSql().includes('SELECT *')) {
      recommendations.push('Avoid SELECT * - specify only needed columns');
    }

    return {
      executionTime,
      rowCount: result.length,
      cacheHit,
      recommendations,
    };
  }
}

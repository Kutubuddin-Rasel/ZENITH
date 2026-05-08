import { Injectable } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { PaginationService } from './pagination.service';
import { QueryAnalyzerService } from './query-analyzer.service';
import { QueryCacheService } from './query-cache.service';
import {
  PaginatedResult,
  PaginationOptions,
  QueryAnalysisResult,
  QueryOptions,
  QueryPlanResult,
} from './query-optimizer.types';

export {
  PaginatedResult,
  PaginationOptions,
  QueryAnalysisResult,
  QueryOptions,
  QueryPlanResult,
};

/**
 * QueryOptimizerService — thin facade over the three SRP-split workers:
 *   - QueryCacheService     (read-through cache + execution)
 *   - PaginationService     (offset/limit math)
 *   - QueryAnalyzerService  (EXPLAIN + recommendations)
 *
 * Public surface preserved for backward compatibility; no behavior change.
 */
@Injectable()
export class QueryOptimizerService {
  constructor(
    private readonly cache: QueryCacheService,
    private readonly pagination: PaginationService,
    private readonly analyzer: QueryAnalyzerService,
  ) {}

  optimizeQuery<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<T[]> {
    return this.cache.optimizeQuery(qb, options);
  }

  optimizeCount<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<number> {
    return this.cache.optimizeCount(qb, options);
  }

  optimizePaginatedQuery<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    pagination: PaginationOptions,
    options: QueryOptions = {},
  ): Promise<PaginatedResult<T>> {
    return this.pagination.paginate(qb, pagination, options);
  }

  warmUpCache<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<void> {
    return this.cache.warmUpCache(qb, options);
  }

  getQueryPlan<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
  ): Promise<QueryPlanResult> {
    return this.analyzer.getQueryPlan(qb);
  }

  analyzeQuery<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<QueryAnalysisResult> {
    return this.analyzer.analyzeQuery(qb, options);
  }
}

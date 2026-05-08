import { Injectable } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { QueryCacheService } from './query-cache.service';
import {
  PaginatedResult,
  PaginationOptions,
  QueryOptions,
} from './query-optimizer.types';

/**
 * PaginationService — pure offset/limit + ordering math. Delegates the actual
 * data fetch and count to QueryCacheService so cache, optimization, and
 * performance-hint behavior remain in a single layer.
 */
@Injectable()
export class PaginationService {
  constructor(private readonly queryCache: QueryCacheService) {}

  async paginate<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    pagination: PaginationOptions,
    options: QueryOptions = {},
  ): Promise<PaginatedResult<T>> {
    const { page, limit, sortBy, sortOrder = 'DESC' } = pagination;
    const offset = (page - 1) * limit;

    qb.skip(offset).take(limit);
    if (sortBy) qb.orderBy(sortBy, sortOrder);

    const [data, total] = await Promise.all([
      this.queryCache.optimizeQuery(qb, options),
      this.queryCache.optimizeCount(qb.clone(), options),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}

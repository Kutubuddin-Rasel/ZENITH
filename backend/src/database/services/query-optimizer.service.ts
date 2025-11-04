import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { CacheService } from '../../cache/cache.service';

export interface QueryOptions {
  useCache?: boolean;
  cacheTtl?: number;
  cacheKey?: string;
  select?: string[];
  relations?: string[];
  where?: any;
  order?: any;
  limit?: number;
  offset?: number;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

@Injectable()
export class QueryOptimizerService {
  private readonly logger = new Logger(QueryOptimizerService.name);

  constructor(private cacheService: CacheService) {}

  /**
   * Optimize a query with caching and performance enhancements
   */
  async optimizeQuery<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<T[]> {
    const {
      useCache = true,
      cacheTtl = 300, // 5 minutes default
      cacheKey,
      select,
      relations,
      where,
      order,
      limit,
      offset,
    } = options;

    // Build cache key if not provided
    const finalCacheKey = cacheKey || this.buildCacheKey(queryBuilder, options);

    // Try to get from cache first
    if (useCache) {
      const cached = await this.cacheService.get<T[]>(finalCacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for key: ${finalCacheKey}`);
        return cached;
      }
    }

    // Apply query optimizations
    this.applyQueryOptimizations(queryBuilder, options);

    // Execute query
    const startTime = Date.now();
    const result = await queryBuilder.getMany();
    const executionTime = Date.now() - startTime;

    this.logger.debug(`Query executed in ${executionTime}ms`);

    // Cache the result
    if (useCache && result.length > 0) {
      await this.cacheService.set(finalCacheKey, result, { ttl: cacheTtl });
    }

    return result;
  }

  /**
   * Optimize a count query
   */
  async optimizeCount<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<number> {
    const { useCache = true, cacheTtl = 300, cacheKey } = options;
    const finalCacheKey = cacheKey
      ? `${cacheKey}:count`
      : this.buildCacheKey(queryBuilder, options, 'count');

    // Try to get from cache first
    if (useCache) {
      const cached = await this.cacheService.get<number>(finalCacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    // Apply optimizations for count queries
    queryBuilder.select('COUNT(*)', 'count');

    const startTime = Date.now();
    const result = await queryBuilder.getRawOne();
    const executionTime = Date.now() - startTime;

    this.logger.debug(`Count query executed in ${executionTime}ms`);

    const count = parseInt(result.count, 10);

    // Cache the result
    if (useCache) {
      await this.cacheService.set(finalCacheKey, count, { ttl: cacheTtl });
    }

    return count;
  }

  /**
   * Optimize a paginated query
   */
  async optimizePaginatedQuery<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    pagination: PaginationOptions,
    options: QueryOptions = {},
  ): Promise<PaginatedResult<T>> {
    const { page, limit, sortBy, sortOrder = 'DESC' } = pagination;
    const offset = (page - 1) * limit;

    // Apply pagination
    queryBuilder.skip(offset).take(limit);

    // Apply sorting
    if (sortBy) {
      queryBuilder.orderBy(sortBy, sortOrder);
    }

    // Execute both data and count queries in parallel
    const [data, total] = await Promise.all([
      this.optimizeQuery(queryBuilder, options),
      this.optimizeCount(queryBuilder.clone(), options),
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

  /**
   * Apply query optimizations
   */
  private applyQueryOptimizations<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    options: QueryOptions,
  ): void {
    const { select, relations, where, order, limit } = options;

    // Apply select fields
    if (select && select.length > 0) {
      queryBuilder.select(select);
    }

    // Apply relations
    if (relations && relations.length > 0) {
      relations.forEach((relation) => {
        queryBuilder.leftJoinAndSelect(relation, relation.split('.')[1]);
      });
    }

    // Apply where conditions
    if (where) {
      queryBuilder.where(where);
    }

    // Apply ordering
    if (order) {
      Object.entries(order).forEach(([field, direction]) => {
        queryBuilder.addOrderBy(field, direction as 'ASC' | 'DESC');
      });
    }

    // Apply limit
    if (limit) {
      queryBuilder.limit(limit);
    }

    // Add performance hints
    this.addPerformanceHints(queryBuilder);
  }

  /**
   * Add performance hints to the query
   */
  private addPerformanceHints<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
  ): void {
    // Add query hints for better performance
    // This is database-specific and may need adjustment based on your DB
    const sql = queryBuilder.getSql();

    // Log slow queries
    if (sql.includes('SELECT') && !sql.includes('LIMIT')) {
      this.logger.warn(
        'Query without LIMIT detected - consider adding pagination',
      );
    }

    // Add index hints for common patterns
    if (sql.includes('WHERE') && sql.includes('projectId')) {
      // This would be handled by database indexes
      this.logger.debug('Query with projectId filter - should use index');
    }
  }

  /**
   * Build cache key from query and options
   */
  private buildCacheKey<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    options: QueryOptions,
    suffix = 'data',
  ): string {
    const sql = queryBuilder.getSql();
    const parameters = queryBuilder.getParameters();

    // Create a hash of the query and parameters
    const queryHash = this.hashString(`${sql}:${JSON.stringify(parameters)}`);

    return `query:${suffix}:${queryHash}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get query execution plan (PostgreSQL specific)
   */
  async getQueryPlan<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
  ): Promise<any> {
    const sql = queryBuilder.getSql();
    const parameters = queryBuilder.getParameters();

    // This would need to be implemented with raw SQL execution
    // For now, return the SQL for analysis
    return {
      sql: sql,
      parameters: parameters,
      // In a real implementation, you would execute EXPLAIN ANALYZE here
    };
  }

  /**
   * Analyze query performance
   */
  async analyzeQuery<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<{
    executionTime: number;
    rowCount: number;
    cacheHit: boolean;
    recommendations: string[];
  }> {
    const startTime = Date.now();
    const cacheKey = this.buildCacheKey(queryBuilder, options);

    // Check if result is in cache
    const cached = await this.cacheService.get(cacheKey);
    const cacheHit = cached !== null;

    let result: T[];
    if (cacheHit && cached) {
      result = cached as T[];
    } else {
      result = await this.optimizeQuery(queryBuilder, options);
    }

    const executionTime = Date.now() - startTime;

    // Generate recommendations
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

    if (queryBuilder.getSql().includes('SELECT *')) {
      recommendations.push('Avoid SELECT * - specify only needed columns');
    }

    return {
      executionTime,
      rowCount: result.length,
      cacheHit,
      recommendations,
    };
  }

  /**
   * Warm up cache for frequently accessed data
   */
  async warmUpCache<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    options: QueryOptions = {},
  ): Promise<void> {
    this.logger.log('Warming up cache...');

    try {
      await this.optimizeQuery(queryBuilder, {
        ...options,
        useCache: true,
        cacheTtl: 3600, // 1 hour for warm-up
      });

      this.logger.log('Cache warmed up successfully');
    } catch (error) {
      this.logger.error('Failed to warm up cache:', error);
    }
  }
}

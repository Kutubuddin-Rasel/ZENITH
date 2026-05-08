import { ObjectLiteral } from 'typeorm';

export interface QueryOptions {
  useCache?: boolean;
  cacheTtl?: number;
  cacheKey?: string;
  select?: string[];
  relations?: string[];
  where?: Record<string, unknown> | Record<string, unknown>[];
  order?: Record<string, 'ASC' | 'DESC'>;
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

export interface QueryPlanResult {
  sql: string;
  parameters: ObjectLiteral;
}

export interface QueryAnalysisResult {
  executionTime: number;
  rowCount: number;
  cacheHit: boolean;
  recommendations: string[];
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CACHE_STORE_TOKEN,
  CACHE_INVALIDATOR_TOKEN,
} from '../../cache/constants/cache.tokens';
import type {
  ICacheStore,
  ICacheInvalidator,
} from '../../cache/interfaces/cache.interfaces';
import type { IApiCacheService } from '../interfaces/performance.interfaces';
import { Request, Response } from 'express';
import { createHash } from 'crypto';

/**
 * ApiCacheService — HTTP Caching + Response Cache Store.
 *
 * SRP: Owns ETag generation (RFC 7232), cache-control header management,
 * cache key generation, and Redis-backed response caching. Delegates
 * all raw cache operations to the segregated cache tokens.
 */
@Injectable()
export class ApiCacheService implements IApiCacheService {
  private readonly logger = new Logger(ApiCacheService.name);

  constructor(
    @Inject(CACHE_STORE_TOKEN)
    private readonly cacheStore: ICacheStore,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly cacheInvalidator: ICacheInvalidator,
  ) {}

  /**
   * Set optimal cache headers for API responses.
   *
   * @param res - Express Response object
   * @param body - The response body to generate ETag from (for content-based caching)
   * @param ttl - Cache TTL in seconds (default: 300)
   * @param isPrivate - Whether response is private (default: false)
   */
  setCacheHeaders<T>(
    res: Response,
    body: T,
    ttl: number = 300,
    isPrivate: boolean = false,
  ): void {
    const cacheControl = isPrivate
      ? `private, max-age=${ttl}`
      : `public, max-age=${ttl}`;

    res.set({
      'Cache-Control': cacheControl,
      Vary: 'Accept-Encoding, Authorization',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });

    // Generate content-based ETag (RFC 7232 compliant)
    const etag = this.generateETag(body);
    res.set('ETag', etag);
  }

  /**
   * Generate content-based ETag using MD5 hash (RFC 7232 compliant).
   *
   * ETags are derived from response content hash, not timestamps.
   * This enables proper HTTP 304 Not Modified responses when content
   * hasn't changed, even across server restarts or redeployments.
   *
   * Algorithm: MD5 (fast, collision resistance not a security concern for cache invalidation)
   * Format: Quoted hex digest, first 32 characters (full MD5)
   *
   * @param data - The response body (Buffer, Object, or String)
   * @returns Quoted ETag string, e.g., '"d41d8cd98f00b204e9800998ecf8427e"'
   */
  generateETag<T>(data: T): string {
    let content: string | Buffer;

    if (Buffer.isBuffer(data)) {
      content = data;
    } else if (typeof data === 'string') {
      content = data;
    } else if (data === null || data === undefined) {
      content = '';
    } else {
      try {
        content = JSON.stringify(data);
      } catch (error) {
        this.logger.warn(
          'ETag generation: Failed to stringify object, using fallback',
          error instanceof Error ? error.message : 'Unknown error',
        );
        content = String(data);
      }
    }

    const hash = createHash('md5').update(content).digest('hex');
    return `"${hash}"`;
  }

  /**
   * Check if request should be cached.
   */
  shouldCache(req: Request): boolean {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return false;
    }

    const queryParams = Object.keys(req.query);
    const dynamicParams = ['timestamp', 'random', 'nocache', 'refresh'];

    if (queryParams.some((param) => dynamicParams.includes(param))) {
      return false;
    }

    if (req.headers.authorization && !req.path.includes('/public/')) {
      return false;
    }

    return true;
  }

  /**
   * Generate cache key for request.
   */
  generateCacheKey(req: Request, userId?: string): string {
    const method = req.method;
    const path = req.path;
    const query = JSON.stringify(req.query);
    const userContext = userId ? `:user:${userId}` : '';

    return `api:${method}:${path}:${this.hashString(query)}${userContext}`;
  }

  /**
   * Get cached response.
   */
  async getCachedResponse<T>(cacheKey: string): Promise<T | null> {
    try {
      return await this.cacheStore.get<T>(cacheKey, { namespace: 'api' });
    } catch (error) {
      this.logger.error(
        `Error getting cached response for key ${cacheKey}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Cache response.
   */
  async cacheResponse<T>(
    cacheKey: string,
    data: T,
    ttl: number = 300,
  ): Promise<boolean> {
    try {
      return await this.cacheStore.set(cacheKey, data, {
        namespace: 'api',
        ttl,
        tags: ['api-response'],
      });
    } catch (error) {
      this.logger.error(`Error caching response for key ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Invalidate cache by pattern.
   */
  async invalidateCache(pattern: string): Promise<boolean> {
    try {
      return await this.cacheInvalidator.flushNamespace(`api:${pattern}`);
    } catch (error) {
      this.logger.error(
        `Error invalidating cache for pattern ${pattern}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Clean up expired cache entries.
   */
  cleanupExpiredCache(): void {
    try {
      this.logger.log('Cleaning up expired cache entries...');
    } catch (error) {
      this.logger.error('Error cleaning up expired cache:', error);
    }
  }

  /**
   * Simple hash function for non-cryptographic use (cache keys, etc.).
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

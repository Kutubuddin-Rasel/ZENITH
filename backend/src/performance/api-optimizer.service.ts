import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import {
  MetricsService,
  PerformanceMetrics,
} from '../common/services/metrics.service';
import { Request, Response } from 'express';
import { createHash } from 'crypto';

export interface CompressionOptions {
  threshold: number; // Minimum size to compress (in bytes)
  level: number; // Compression level (1-9)
  memLevel: number; // Memory level (1-9)
}

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

export interface CacheHeaders {
  'Cache-Control'?: string;
  ETag?: string;
  'Last-Modified'?: string;
  Expires?: string;
}

@Injectable()
export class ApiOptimizerService {
  private readonly logger = new Logger(ApiOptimizerService.name);
  private readonly compressionOptions: CompressionOptions = {
    threshold: 1024, // 1KB
    level: 6,
    memLevel: 8,
  };

  constructor(
    private cacheService: CacheService,
    private metricsService: MetricsService,
  ) {}

  /**
   * Set optimal cache headers for API responses
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
   * Generate content-based ETag using MD5 hash (RFC 7232 compliant)
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

    // Handle different input types
    if (Buffer.isBuffer(data)) {
      // Buffer: Hash directly
      content = data;
    } else if (typeof data === 'string') {
      // String: Hash directly
      content = data;
    } else if (data === null || data === undefined) {
      // Null/undefined: Empty content
      content = '';
    } else {
      // Object: Stringify for deterministic hashing
      // Note: JSON.stringify may throw on circular references
      try {
        content = JSON.stringify(data);
      } catch (error) {
        // Fallback for circular references or non-serializable objects
        this.logger.warn(
          'ETag generation: Failed to stringify object, using fallback',
          error instanceof Error ? error.message : 'Unknown error',
        );
        content = String(data);
      }
    }

    // Generate MD5 hash
    const hash = createHash('md5').update(content).digest('hex');

    // Return quoted ETag (RFC 7232 format)
    return `"${hash}"`;
  }

  /**
   * Simple hash function for non-cryptographic use (cache keys, etc.)
   * For cryptographic hashing, use generateETag() or crypto directly.
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

  /**
   * Check if request should be cached
   */
  shouldCache(req: Request): boolean {
    // Don't cache POST, PUT, DELETE requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return false;
    }

    // Don't cache requests with query parameters that change frequently
    const queryParams = Object.keys(req.query);
    const dynamicParams = ['timestamp', 'random', 'nocache', 'refresh'];

    if (queryParams.some((param) => dynamicParams.includes(param))) {
      return false;
    }

    // Don't cache requests with authorization headers (unless it's a public endpoint)
    if (req.headers.authorization && !req.path.includes('/public/')) {
      return false;
    }

    return true;
  }

  /**
   * Generate cache key for request
   */
  generateCacheKey(req: Request, userId?: string): string {
    const method = req.method;
    const path = req.path;
    const query = JSON.stringify(req.query);
    const userContext = userId ? `:user:${userId}` : '';

    return `api:${method}:${path}:${this.hashString(query)}${userContext}`;
  }

  /**
   * Get cached response
   */
  async getCachedResponse<T>(cacheKey: string): Promise<T | null> {
    try {
      return await this.cacheService.get<T>(cacheKey, { namespace: 'api' });
    } catch (error) {
      this.logger.error(
        `Error getting cached response for key ${cacheKey}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Cache response
   */
  async cacheResponse<T>(
    cacheKey: string,
    data: T,
    ttl: number = 300,
  ): Promise<boolean> {
    try {
      return await this.cacheService.set(cacheKey, data, {
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
   * Invalidate cache by pattern
   */
  async invalidateCache(pattern: string): Promise<boolean> {
    try {
      return await this.cacheService.flushNamespace(`api:${pattern}`);
    } catch (error) {
      this.logger.error(
        `Error invalidating cache for pattern ${pattern}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Optimize response data by removing null/undefined values.
   *
   * TYPE SAFETY (Phase 5):
   * Uses generic <T> to preserve the input type through the transformation.
   * The caller's specific interface is maintained in the return type.
   *
   * @param data - Input data of type T
   * @returns Optimized data with nulls removed, typed as T
   */
  optimizeResponseData<T>(data: T): T {
    if (!data) return data;

    // Handle arrays - filter null/undefined items
    if (Array.isArray(data)) {
      return data.filter(
        (item): item is NonNullable<(typeof data)[number]> =>
          item !== null && item !== undefined,
      ) as T;
    }

    // Handle objects - recursively remove null/undefined values
    if (typeof data === 'object' && data !== null) {
      const optimized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        data as Record<string, unknown>,
      )) {
        if (value !== null && value !== undefined) {
          optimized[key] = this.optimizeResponseData(value);
        }
      }
      return optimized as T;
    }

    // Primitive types pass through unchanged
    return data;
  }

  /**
   * Compress response data to gzip Buffer.
   *
   * TYPE SAFETY (Phase 5):
   * Uses generic <T> to accept typed input. Output is always Buffer.
   * JSON.stringify accepts any serializable type.
   *
   * @param data - Input data of type T (must be JSON-serializable)
   * @returns Promise<Buffer> - Compressed or uncompressed buffer
   */
  async compressResponse<T>(data: T): Promise<Buffer> {
    const zlib = await import('zlib');
    const jsonString = JSON.stringify(data);
    const buffer = Buffer.from(jsonString, 'utf8');

    // Only compress if data is larger than threshold
    if (buffer.length < this.compressionOptions.threshold) {
      return buffer;
    }

    return new Promise((resolve, reject) => {
      zlib.gzip(
        buffer,
        {
          level: this.compressionOptions.level,
          memLevel: this.compressionOptions.memLevel,
        },
        (err, compressed) => {
          if (err) {
            reject(err);
          } else {
            resolve(compressed);
          }
        },
      );
    });
  }

  /**
   * Decompress gzip Buffer back to typed data.
   *
   * TYPE SAFETY (Phase 5):
   * Uses generic <T> so caller specifies expected output type.
   * JSON.parse returns unknown, we cast to T inside the function.
   *
   * USAGE:
   *   const user = await decompressResponse<User>(buffer);
   *   // user is typed as User, not any
   *
   * @param compressedData - Gzip compressed Buffer (or uncompressed JSON buffer)
   * @returns Promise<T> - Parsed and typed data
   */
  async decompressResponse<T>(compressedData: Buffer): Promise<T> {
    const zlib = await import('zlib');

    return new Promise((resolve, reject) => {
      zlib.gunzip(compressedData, (err, decompressed) => {
        if (err) {
          reject(err);
        } else {
          try {
            const jsonString = decompressed.toString('utf8');
            // TYPE ASSERTION: Cast JSON.parse result to caller-specified type T
            // This is safe because caller knows what type they compressed
            const parsed: unknown = JSON.parse(jsonString);
            resolve(parsed as T);
          } catch (parseError) {
            reject(
              parseError instanceof Error
                ? parseError
                : new Error(String(parseError)),
            );
          }
        }
      });
    });
  }

  /**
   * Set compression headers
   */
  setCompressionHeaders(res: Response, compressed: boolean = false): void {
    if (compressed) {
      res.set('Content-Encoding', 'gzip');
      res.set('Vary', 'Accept-Encoding');
    }
  }

  /**
   * Check if client accepts compression
   */
  acceptsCompression(req: Request): boolean {
    const acceptEncoding = req.headers['accept-encoding'] || '';
    return acceptEncoding.includes('gzip');
  }

  /**
   * Rate limiting check using atomic Redis INCR
   *
   * **Concurrency Strategy:**
   * Uses Redis INCR which is atomic at the database level. Even if 1000
   * concurrent requests hit this code simultaneously:
   * - Each INCR operation is serialized by Redis
   * - Each request gets its unique incremented value
   * - No race condition: can't have two requests both see "99" and both pass
   *
   * **TTL Logic:**
   * - CacheService.incr() sets TTL only on first request (when value === 1)
   * - This creates a fixed sliding window from the first request
   *
   * **Fail Open Strategy:**
   * - If Redis is down, allow request (log error)
   * - This prevents total service outage during Redis failures
   * - For financial/critical limits, change to fail closed
   */
  async checkRateLimit(
    identifier: string,
    options: RateLimitOptions,
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const key = `rate_limit:${identifier}`;
    const now = Date.now();
    const ttlSeconds = Math.ceil(options.windowMs / 1000);

    try {
      // ATOMIC: Increment and get new value in one Redis operation
      // CacheService.incr() sets TTL only on first request (value === 1)
      const currentCount = await this.cacheService.incr(key, {
        ttl: ttlSeconds,
        namespace: 'rate_limit',
      });

      // Check if limit exceeded AFTER incrementing
      // This is the key insight: we've already reserved our slot
      if (currentCount > options.max) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: now + options.windowMs,
        };
      }

      return {
        allowed: true,
        remaining: options.max - currentCount,
        resetTime: now + options.windowMs,
      };
    } catch (error: unknown) {
      // Fail open: Allow request if Redis is down
      // This prevents total service outage during Redis failures
      this.logger.error(
        `Rate limit check failed for ${identifier}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return {
        allowed: true,
        remaining: options.max,
        resetTime: now + options.windowMs,
      };
    }
  }

  /**
   * Set rate limit headers
   */
  setRateLimitHeaders(
    res: Response,
    remaining: number,
    resetTime: number,
    limit: number,
  ): void {
    res.set({
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(resetTime).toISOString(),
    });
  }

  /**
   * Get API performance metrics (Phase 3 - Real Metrics)
   *
   * Returns REAL performance data from Prometheus counters,
   * not mock data. Delegates to MetricsService for actual values.
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    return this.metricsService.getPerformanceMetrics();
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpiredCache(): void {
    try {
      // This would be implemented with a background job
      // For now, just log the cleanup
      this.logger.log('Cleaning up expired cache entries...');
    } catch (error) {
      this.logger.error('Error cleaning up expired cache:', error);
    }
  }
}

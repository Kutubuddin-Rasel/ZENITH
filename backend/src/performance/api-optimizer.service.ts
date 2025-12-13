import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { Request, Response } from 'express';

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

  constructor(private cacheService: CacheService) {}

  /**
   * Set optimal cache headers for API responses
   */
  setCacheHeaders(
    res: Response,
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

    // Add ETag for better caching
    const etag = this.generateETag(res.get('Content-Type') || '');
    res.set('ETag', etag);
  }

  /**
   * Generate ETag for response
   */
  private generateETag(contentType: string): string {
    const timestamp = Date.now();
    const hash = this.hashString(`${contentType}:${timestamp}`);
    return `"${hash}"`;
  }

  /**
   * Simple hash function
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
   * Optimize response data
   */
  optimizeResponseData(data: any): any {
    if (!data) return data;

    // Remove null/undefined values
    if (Array.isArray(data)) {
      return data.filter((item) => item !== null && item !== undefined);
    }

    if (typeof data === 'object') {
      const optimized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        data as Record<string, unknown>,
      )) {
        if (value !== null && value !== undefined) {
          optimized[key] = this.optimizeResponseData(value);
        }
      }
      return optimized;
    }

    return data;
  }

  /**
   * Compress response data
   */
  async compressResponse(data: any): Promise<Buffer> {
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
   * Decompress response data
   */
  async decompressResponse(compressedData: Buffer): Promise<any> {
    const zlib = await import('zlib');

    return new Promise((resolve, reject) => {
      zlib.gunzip(compressedData, (err, decompressed) => {
        if (err) {
          reject(err);
        } else {
          try {
            const jsonString = decompressed.toString('utf8');
            resolve(JSON.parse(jsonString));
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
   * Rate limiting check
   */
  async checkRateLimit(
    identifier: string,
    options: RateLimitOptions,
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const key = `rate_limit:${identifier}`;
    const now = Date.now();

    try {
      // Get current request count
      const currentCount = (await this.cacheService.get<number>(key)) || 0;

      if (currentCount >= options.max) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: now + options.windowMs,
        };
      }

      // Increment counter
      const newCount = currentCount + 1;
      await this.cacheService.set(key, newCount, {
        ttl: Math.ceil(options.windowMs / 1000),
        namespace: 'rate_limit',
      });

      return {
        allowed: true,
        remaining: options.max - newCount,
        resetTime: now + options.windowMs,
      };
    } catch (error) {
      this.logger.error(`Error checking rate limit for ${identifier}:`, error);
      // Allow request if rate limiting fails
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
   * Get API performance metrics
   */
  async getPerformanceMetrics(): Promise<{
    cacheHitRate: number;
    averageResponseTime: number;
    totalRequests: number;
    errorRate: number;
  }> {
    try {
      await this.cacheService.getStats();

      // This would need to be implemented with actual metrics collection
      // For now, return mock data
      return {
        cacheHitRate: 0.85,
        averageResponseTime: 150,
        totalRequests: 1000,
        errorRate: 0.02,
      };
    } catch (error) {
      this.logger.error('Error getting performance metrics:', error);
      return {
        cacheHitRate: 0,
        averageResponseTime: 0,
        totalRequests: 0,
        errorRate: 0,
      };
    }
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

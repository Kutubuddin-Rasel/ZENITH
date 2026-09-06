/**
 * Performance Module — Segregated Interfaces (ISP).
 *
 * Each interface represents a single, focused responsibility extracted
 * from the former `ApiOptimizerService` god-class. Consumers inject
 * ONLY the surface they need via the tokens in `../constants/performance.tokens.ts`.
 *
 * ZERO domain coupling — all method signatures use generic types or
 * Express primitives (Request/Response).
 */
import { Request, Response } from 'express';

// ─── Rate Limit Types ────────────────────────────────────────────────
export interface RateLimitOptions {
  windowMs: number;
  max: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

// ─── Compression Types ───────────────────────────────────────────────
export interface CompressionOptions {
  threshold: number;
  level: number;
  memLevel: number;
}

// ─── IApiCacheService ────────────────────────────────────────────────
/**
 * HTTP caching + response cache store operations.
 * Owns: ETag generation, cache-control headers, key generation,
 *       Redis-backed response caching, and cache invalidation.
 */
export interface IApiCacheService {
  setCacheHeaders<T>(
    res: Response,
    body: T,
    ttl?: number,
    isPrivate?: boolean,
  ): void;
  generateETag<T>(data: T): string;
  shouldCache(req: Request): boolean;
  generateCacheKey(req: Request, userId?: string): string;
  getCachedResponse<T>(cacheKey: string): Promise<T | null>;
  cacheResponse<T>(cacheKey: string, data: T, ttl?: number): Promise<boolean>;
  invalidateCache(pattern: string): Promise<boolean>;
  cleanupExpiredCache(): void;
}

// ─── IRateLimiter ────────────────────────────────────────────────────
/**
 * Atomic rate limiting via Redis INCR.
 * Owns: sliding-window check, rate-limit response headers.
 */
export interface IRateLimiter {
  checkRateLimit(
    identifier: string,
    options: RateLimitOptions,
  ): Promise<RateLimitResult>;
  setRateLimitHeaders(
    res: Response,
    remaining: number,
    resetTime: number,
    limit: number,
  ): void;
}

// ─── IResponseCompressor ────────────────────────────────────────────
/**
 * Gzip compression/decompression for response payloads.
 * Pure infrastructure — no cache or domain dependencies.
 */
export interface IResponseCompressor {
  compressResponse<T>(data: T): Promise<Buffer>;
  decompressResponse<T>(compressedData: Buffer): Promise<T>;
  setCompressionHeaders(res: Response, compressed?: boolean): void;
  acceptsCompression(req: Request): boolean;
}

// ─── IResponseOptimizer ─────────────────────────────────────────────
/**
 * Response payload optimization (null/undefined stripping).
 * Pure logic — no external dependencies.
 */
export interface IResponseOptimizer {
  optimizeResponseData<T>(data: T): T;
}

/**
 * Performance DI Tokens.
 *
 * Symbol-based injection tokens for the segregated performance contracts
 * in `../interfaces/performance.interfaces.ts`. Symbols guarantee zero
 * collision risk across the application graph.
 *
 * USAGE:
 *   constructor(@Inject(API_CACHE_TOKEN) private readonly cache: IApiCacheService) {}
 */

export const API_CACHE_TOKEN: unique symbol = Symbol('API_CACHE_TOKEN');
export const RATE_LIMITER_TOKEN: unique symbol = Symbol('RATE_LIMITER_TOKEN');
export const RESPONSE_COMPRESSOR_TOKEN: unique symbol = Symbol(
  'RESPONSE_COMPRESSOR_TOKEN',
);
export const RESPONSE_OPTIMIZER_TOKEN: unique symbol = Symbol(
  'RESPONSE_OPTIMIZER_TOKEN',
);

/**
 * Cache DI Tokens.
 *
 * Symbol-based injection tokens for the segregated cache contracts in
 * `../interfaces/cache.interfaces.ts`. Symbols guarantee zero collision risk
 * across the application graph.
 *
 * USAGE:
 *   constructor(@Inject(CACHE_STORE_TOKEN) private readonly cache: ICacheStore) {}
 *
 * `CACHE_CLIENT_TOKEN` exposes the underlying ioredis client for the narrow set
 * of providers (cache providers themselves, BullMQ adapters, raw Redis ops)
 * that legitimately need direct client access. Application services MUST
 * prefer the abstract interface tokens.
 */

export const CACHE_STORE_TOKEN: unique symbol = Symbol('CACHE_STORE_TOKEN');
export const CACHE_INVALIDATOR_TOKEN: unique symbol = Symbol(
  'CACHE_INVALIDATOR_TOKEN',
);
export const CACHE_LIST_TOKEN: unique symbol = Symbol('CACHE_LIST_TOKEN');
export const CACHE_HEALTH_TOKEN: unique symbol = Symbol('CACHE_HEALTH_TOKEN');
export const CACHE_COUNTER_TOKEN: unique symbol = Symbol('CACHE_COUNTER_TOKEN');
export const CACHE_SORTED_SET_TOKEN: unique symbol = Symbol(
  'CACHE_SORTED_SET_TOKEN',
);
export const ENTITY_CACHE_TOKEN: unique symbol = Symbol('ENTITY_CACHE_TOKEN');
export const CACHE_SERVICE_TOKEN: unique symbol = Symbol('CACHE_SERVICE_TOKEN');
export const CACHE_CLIENT_TOKEN: unique symbol = Symbol('CACHE_CLIENT_TOKEN');

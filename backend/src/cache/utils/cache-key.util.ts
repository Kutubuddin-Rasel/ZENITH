import { CacheOptions } from '../interfaces/cache.interfaces';

/**
 * Cache key conventions shared across every Redis* provider.
 *
 * - Application keys: `{namespace}:{key}` (default namespace = `'default'`).
 * - Tag tracking sets: `tag:{tagName}` — a Redis SET of cache keys that hold
 *   the given tag. Written by `RedisCacheStore.set` (when `options.tags` is
 *   non-empty), read by `RedisCacheInvalidator.invalidateByTags` /
 *   `getKeysByTags`.
 */
export const TAG_KEY_PREFIX = 'tag:' as const;
export const DEFAULT_NAMESPACE = 'default' as const;

export function buildCacheKey(key: string, options?: CacheOptions): string {
  const namespace = options?.namespace ?? DEFAULT_NAMESPACE;
  return `${namespace}:${key}`;
}

export function buildTagKey(tag: string): string {
  return `${TAG_KEY_PREFIX}${tag}`;
}

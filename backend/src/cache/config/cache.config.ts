import { registerAs } from '@nestjs/config';

/**
 * Cache Configuration (Cache Module Step 1).
 *
 * TTL tiers + cache behavior, registered under the `cache` namespace.
 * Consumed by `CacheTtlService` and (in Step 2) wired via
 * `ConfigModule.forFeature([cacheConfig])` inside `CacheModule`.
 *
 * Redis connection settings have moved to a sibling factory:
 * `./redis.config.ts` (`registerAs('redis')`).
 */
export const cacheConfig = registerAs('cache', () => ({
  /**
   * TTL Tiers (seconds). Use these to keep cache durations consistent across
   * the codebase rather than scattering literal values.
   */
  ttl: {
    /** Real-time data, board updates, active user lists. */
    micro: parseInt(process.env.CACHE_TTL_MICRO ?? '5', 10),
    /** Dashboard stats, notification counts. */
    short: parseInt(process.env.CACHE_TTL_SHORT ?? '60', 10),
    /** Reports, team analytics, project summaries. */
    medium: parseInt(process.env.CACHE_TTL_MEDIUM ?? '300', 10),
    /** User profiles, project settings, role definitions. */
    long: parseInt(process.env.CACHE_TTL_LONG ?? '900', 10),
    /** Templates, static configurations, permissions. */
    extended: parseInt(process.env.CACHE_TTL_EXTENDED ?? '3600', 10),
    /** Analytics aggregates, daily-stable usage stats. */
    daily: parseInt(process.env.CACHE_TTL_DAILY ?? '86400', 10),
  },

  /**
   * Cache key prefix (namespace organization).
   */
  keyPrefix: process.env.CACHE_KEY_PREFIX ?? 'zenith:',

  /**
   * Global kill-switch for caching (debugging / incident response).
   */
  enabled: process.env.CACHE_ENABLED !== 'false',
}));

export type CacheConfig = ReturnType<typeof cacheConfig>;

import { registerAs } from '@nestjs/config';

/**
 * Cache Configuration
 *
 * TTL tiers and cache behavior settings.
 * Group related cache TTLs by their data freshness requirements.
 */
export const cacheConfig = registerAs('cache', () => ({
  /**
   * Redis connection settings
   */
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),

    /**
     * Connection keep-alive interval in milliseconds
     */
    keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE_MS || '30000', 10),

    /**
     * Command timeout in milliseconds
     */
    commandTimeout: parseInt(
      process.env.REDIS_COMMAND_TIMEOUT_MS || '3000',
      10,
    ),
  },

  /**
   * TTL Tiers - Use these for consistent caching across the application
   * All values in seconds
   */
  ttl: {
    /**
     * Micro cache - For data that changes very frequently
     * Use for: Real-time board updates, active user lists
     */
    micro: parseInt(process.env.CACHE_TTL_MICRO || '5', 10),

    /**
     * Short TTL - For data that should be near-real-time
     * Use for: Dashboard stats, notification counts
     */
    short: parseInt(process.env.CACHE_TTL_SHORT || '60', 10),

    /**
     * Medium TTL - For data that updates periodically
     * Use for: Reports, team analytics, project summaries
     */
    medium: parseInt(process.env.CACHE_TTL_MEDIUM || '300', 10),

    /**
     * Long TTL - For data that rarely changes
     * Use for: User profiles, project settings, role definitions
     */
    long: parseInt(process.env.CACHE_TTL_LONG || '900', 10),

    /**
     * Extended TTL - For reference data
     * Use for: Templates, static configurations, permissions
     */
    extended: parseInt(process.env.CACHE_TTL_EXTENDED || '3600', 10),

    /**
     * Daily TTL - For data that changes daily at most
     * Use for: Analytics aggregates, usage stats
     */
    daily: parseInt(process.env.CACHE_TTL_DAILY || '86400', 10),
  },

  /**
   * Cache key prefixes (for namespace organization)
   */
  keyPrefix: process.env.CACHE_KEY_PREFIX || 'zenith:',

  /**
   * Enable/disable caching globally (useful for debugging)
   */
  enabled: process.env.CACHE_ENABLED !== 'false',
}));

export type CacheConfig = ReturnType<typeof cacheConfig>;

/**
 * Configuration Module Index
 *
 * Re-exports all configuration factories for use with NestJS ConfigModule.
 */

export { appConfig, AppConfig } from './app.config';
export { authConfig, AuthConfig } from './auth.config';
export { rateLimitConfig, RateLimitConfig } from './rate-limit.config';
export { cacheConfig, CacheConfig } from './cache.config';
export { integrationConfig, IntegrationConfig } from './integration.config';

/**
 * All configuration factories for ConfigModule.forRoot()
 */
export const allConfigs = [
  // Dynamic imports to avoid circular dependencies
  async () => (await import('./app.config')).appConfig,
  async () => (await import('./auth.config')).authConfig,
  async () => (await import('./rate-limit.config')).rateLimitConfig,
  async () => (await import('./cache.config')).cacheConfig,
  async () => (await import('./integration.config')).integrationConfig,
];

/**
 * Configuration keys for type-safe injection
 */
export const CONFIG_KEYS = {
  APP: 'app',
  AUTH: 'auth',
  RATE_LIMIT: 'rateLimit',
  CACHE: 'cache',
  INTEGRATION: 'integration',
} as const;

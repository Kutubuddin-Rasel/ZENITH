import { registerAs } from '@nestjs/config';

/**
 * Application Configuration
 *
 * Core application settings including URLs, environment, and deployment info.
 * These are the foundational values used throughout the application.
 */
export const appConfig = registerAs('app', () => ({
  /**
   * Application environment
   * Values: 'development', 'staging', 'production', 'test'
   */
  nodeEnv: process.env.NODE_ENV || 'development',

  /**
   * Whether the app is running in production mode
   */
  isProduction: process.env.NODE_ENV === 'production',

  /**
   * Backend API base URL (used for OAuth callbacks, webhooks, etc.)
   * Example: https://api.example.com
   */
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',

  /**
   * Frontend application URL (used for redirects, CORS, emails)
   * Example: https://app.example.com
   */
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',

  /**
   * Server port
   */
  port: parseInt(process.env.PORT || '3000', 10),

  /**
   * CORS configuration
   */
  cors: {
    /**
     * CORS max age in seconds (how long preflight results are cached)
     */
    maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10),

    /**
     * Additional CORS origins (comma-separated)
     * Example: https://admin.example.com,https://mobile.example.com
     */
    additionalOrigins: process.env.CORS_ADDITIONAL_ORIGINS
      ? process.env.CORS_ADDITIONAL_ORIGINS.split(',').map((s) => s.trim())
      : [],
  },

  /**
   * Graceful shutdown grace period in milliseconds
   */
  gracePeriodMs: parseInt(process.env.API_GRACE_PERIOD_MS || '5000', 10),
}));

export type AppConfig = ReturnType<typeof appConfig>;

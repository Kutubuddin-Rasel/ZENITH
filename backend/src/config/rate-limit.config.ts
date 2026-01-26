import { registerAs } from '@nestjs/config';

/**
 * Rate Limiting Configuration
 *
 * Controls API rate limits for various endpoints.
 * Tune these based on your traffic patterns and security requirements.
 */
export const rateLimitConfig = registerAs('rateLimit', () => ({
  /**
   * Global rate limit (applies to all endpoints unless overridden)
   */
  global: {
    /**
     * Maximum requests per time window
     */
    limit: parseInt(process.env.RATE_LIMIT_GLOBAL_LIMIT || '100', 10),

    /**
     * Time window in milliseconds
     */
    ttlMs: parseInt(process.env.RATE_LIMIT_GLOBAL_TTL_MS || '60000', 10),
  },

  /**
   * Login endpoint rate limit
   * Protects against brute-force password attacks
   */
  login: {
    limit: parseInt(process.env.RATE_LIMIT_LOGIN_LIMIT || '5', 10),
    ttlMs: parseInt(process.env.RATE_LIMIT_LOGIN_TTL_MS || '60000', 10),
  },

  /**
   * Registration endpoint rate limit
   * Prevents spam account creation
   */
  register: {
    limit: parseInt(process.env.RATE_LIMIT_REGISTER_LIMIT || '3', 10),
    ttlMs: parseInt(process.env.RATE_LIMIT_REGISTER_TTL_MS || '60000', 10),
  },

  /**
   * 2FA verification rate limit
   * Protects against TOTP brute-force
   */
  twoFactor: {
    limit: parseInt(process.env.RATE_LIMIT_2FA_LIMIT || '5', 10),
    ttlMs: parseInt(process.env.RATE_LIMIT_2FA_TTL_MS || '60000', 10),
  },

  /**
   * Recovery request rate limit
   * Prevents email bombing via recovery requests
   */
  recovery: {
    limit: parseInt(process.env.RATE_LIMIT_RECOVERY_LIMIT || '3', 10),
    ttlMs: parseInt(process.env.RATE_LIMIT_RECOVERY_TTL_MS || '300000', 10), // 5 minutes
  },

  /**
   * API key operations rate limit
   */
  apiKey: {
    limit: parseInt(process.env.RATE_LIMIT_API_KEY_LIMIT || '10', 10),
    ttlMs: parseInt(process.env.RATE_LIMIT_API_KEY_TTL_MS || '60000', 10),
  },

  /**
   * Password reset rate limit
   */
  passwordReset: {
    limit: parseInt(process.env.RATE_LIMIT_PASSWORD_RESET_LIMIT || '3', 10),
    ttlMs: parseInt(
      process.env.RATE_LIMIT_PASSWORD_RESET_TTL_MS || '3600000',
      10,
    ), // 1 hour
  },
}));

export type RateLimitConfig = ReturnType<typeof rateLimitConfig>;

import { registerAs } from '@nestjs/config';

/**
 * Authentication Configuration
 *
 * All authentication-related settings including JWT, cookies, passwords, and 2FA.
 * Enterprise customers can customize these for their security policies.
 */
export const authConfig = registerAs('auth', () => ({
  /**
   * JWT Configuration
   */
  jwt: {
    /**
     * Access token expiry time
     * Examples: '15m', '1h', '30m'
     * Default: 15 minutes (recommended for security)
     */
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',

    /**
     * Refresh token expiry time
     * Examples: '7d', '30d', '1d'
     * Default: 7 days
     */
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',

    /**
     * 2FA session token expiry (between password and TOTP verification)
     * Should be short-lived for security
     */
    twoFactorSessionExpiry: process.env.JWT_2FA_SESSION_EXPIRY || '5m',

    /**
     * Default JWT expiry for general tokens
     */
    defaultExpiry: process.env.JWT_DEFAULT_EXPIRY || '1h',
  },

  /**
   * Cookie Configuration
   */
  cookie: {
    /**
     * Refresh token cookie TTL in days
     */
    refreshTokenTtlDays: parseInt(
      process.env.REFRESH_TOKEN_TTL_DAYS || '7',
      10,
    ),

    /**
     * Cookie domain (for cross-subdomain auth)
     * Example: .example.com
     */
    domain: process.env.COOKIE_DOMAIN || undefined,

    /**
     * Secure cookies (HTTPS only)
     * Auto-enabled in production
     */
    secure:
      process.env.COOKIE_SECURE === 'true' ||
      process.env.NODE_ENV === 'production',

    /**
     * SameSite policy
     * Values: 'strict', 'lax', 'none'
     */
    sameSite: (process.env.COOKIE_SAME_SITE || 'lax') as
      | 'strict'
      | 'lax'
      | 'none',
  },

  /**
   * Password Policy
   * NIST 800-63B compliant defaults
   */
  password: {
    /**
     * Minimum password length
     * NIST recommends minimum 8, we default to 12 for enhanced security
     */
    minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '12', 10),

    /**
     * Maximum password length
     * Should be high enough to allow passphrases
     */
    maxLength: parseInt(process.env.PASSWORD_MAX_LENGTH || '128', 10),

    /**
     * Require complexity (uppercase, lowercase, number, special char)
     */
    requireComplexity: process.env.PASSWORD_REQUIRE_COMPLEXITY !== 'false',
  },

  /**
   * Two-Factor Authentication
   */
  twoFactor: {
    /**
     * TOTP time window (number of 30-second intervals to accept)
     * 1 = ±30 seconds
     * 2 = ±60 seconds
     */
    totpWindow: parseInt(process.env.TOTP_WINDOW || '1', 10),

    /**
     * Recovery codes count
     */
    recoveryCodeCount: parseInt(process.env.TOTP_RECOVERY_CODES || '8', 10),
  },

  /**
   * Account Lockout Configuration
   * NIST 800-63B compliant - credential stuffing defense
   */
  lockout: {
    /**
     * Maximum failed login attempts before lockout
     * Default: 5 attempts (NIST recommended)
     */
    maxAttempts: parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10),

    /**
     * Initial lockout duration in seconds
     * Default: 15 minutes (900 seconds)
     */
    initialLockoutSeconds: parseInt(
      process.env.LOCKOUT_INITIAL_SECONDS || '900',
      10,
    ),

    /**
     * Exponential backoff multiplier
     * Applied on subsequent lockouts: initialLockout * (multiplier ^ lockoutCount)
     * Default: 2 (15min → 30min → 60min → ...)
     */
    backoffMultiplier: parseFloat(
      process.env.LOCKOUT_BACKOFF_MULTIPLIER || '2',
    ),

    /**
     * Maximum lockout duration in seconds (cap for exponential backoff)
     * Default: 1 hour (3600 seconds)
     */
    maxLockoutSeconds: parseInt(process.env.LOCKOUT_MAX_SECONDS || '3600', 10),
  },
}));

export type AuthConfig = ReturnType<typeof authConfig>;

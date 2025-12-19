/**
 * Token Generation Utility
 *
 * Centralizes all secure token generation to ensure consistency
 * and prevent copy-paste errors across the codebase.
 *
 * Usage:
 *   generateSecureToken('zth_live_')  // API keys
 *   generateSecureToken(TokenPrefix.PAT)  // Personal Access Tokens
 *   generateHexToken(32)  // Webhook secrets
 */
import * as crypto from 'crypto';

/**
 * Standard token prefixes used across Zenith
 */
export const TokenPrefix = {
  /** API Keys: zth_live_xxxx */
  API_KEY: 'zth_live_',
  /** Personal Access Tokens: zenith_pat_xxxx */
  PAT: 'zenith_pat_',
  /** Session tokens: zth_sess_xxxx */
  SESSION: 'zth_sess_',
  /** Webhook secrets: zth_whk_xxxx */
  WEBHOOK: 'zth_whk_',
  /** OAuth state: zth_oauth_xxxx */
  OAUTH_STATE: 'zth_oauth_',
  /** Invite codes: zth_inv_xxxx */
  INVITE: 'zth_inv_',
} as const;

export type TokenPrefixType = (typeof TokenPrefix)[keyof typeof TokenPrefix];

/**
 * Generate a cryptographically secure token with optional prefix.
 *
 * Uses Base64URL encoding (URL-safe, no padding).
 *
 * @param prefix - Token prefix (use TokenPrefix constants)
 * @param byteLength - Number of random bytes (default: 24 = 32 chars)
 * @returns Prefixed token string
 *
 * @example
 * generateSecureToken(TokenPrefix.API_KEY)  // "zth_live_abc123..."
 * generateSecureToken('custom_', 16)        // "custom_xyz789..."
 */
export function generateSecureToken(
  prefix: string = '',
  byteLength = 24,
): string {
  const randomPart = crypto.randomBytes(byteLength).toString('base64url');
  return `${prefix}${randomPart}`;
}

/**
 * Generate a cryptographically secure hex token.
 *
 * Useful for webhook secrets, verification codes, etc.
 *
 * @param length - Number of hex characters (actual bytes = length/2)
 * @returns Hex string of specified length
 *
 * @example
 * generateHexToken(32)  // "a1b2c3d4e5f6..."
 */
export function generateHexToken(length = 32): string {
  // Each byte = 2 hex chars, so we need length/2 bytes
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Generate a random numeric code (for OTPs, verification codes).
 *
 * @param digits - Number of digits (default: 6)
 * @returns Numeric string with leading zeros preserved
 *
 * @example
 * generateNumericCode(6)  // "012345"
 */
export function generateNumericCode(digits = 6): string {
  const max = Math.pow(10, digits);
  const randomNum = crypto.randomInt(0, max);
  return randomNum.toString().padStart(digits, '0');
}

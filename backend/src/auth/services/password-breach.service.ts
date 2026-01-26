import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CacheService } from '../../cache/cache.service';

/**
 * Password Breach Detection Service
 *
 * Implements HIBP Passwords API v3 using k-anonymity model (NIST 800-63B compliant).
 *
 * Security Model:
 * - Password is hashed with SHA-1 locally
 * - Only the first 5 characters (prefix) are sent to HIBP API
 * - The API returns all hash suffixes matching that prefix
 * - Local comparison determines if password was breached
 *
 * Privacy: The full password or hash is NEVER sent to any external service.
 *
 * Resilience: Non-blocking. If HIBP API fails, we log a warning and allow
 * the password (fail open) to avoid blocking users due to external service issues.
 *
 * Optimization: Safe passwords are cached in Redis for 24 hours to minimize API calls.
 */
@Injectable()
export class PasswordBreachService {
  private readonly logger = new Logger(PasswordBreachService.name);
  private readonly HIBP_API_URL = 'https://api.pwnedpasswords.com/range/';
  private readonly CACHE_TTL_SECONDS = 86400; // 24 hours
  private readonly API_TIMEOUT_MS = 5000; // 5 second timeout

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Check if a password has been exposed in known data breaches.
   *
   * @param password - The plaintext password to check
   * @returns Object with `isBreached` boolean and `breachCount` if found
   *
   * @example
   * const result = await passwordBreachService.checkPassword('password123');
   * if (result.isBreached) {
   *   throw new BadRequestException('This password has appeared in data breaches');
   * }
   */
  async checkPassword(password: string): Promise<{
    isBreached: boolean;
    breachCount: number;
    cached: boolean;
  }> {
    try {
      // Step 1: Hash the password with SHA-1
      const sha1Hash = createHash('sha1')
        .update(password)
        .digest('hex')
        .toUpperCase();

      // Step 2: Split into prefix (first 5 chars) and suffix (remaining)
      const prefix = sha1Hash.substring(0, 5);
      const suffix = sha1Hash.substring(5);

      // Step 3: Check cache first (for safe passwords)
      const cacheKey = `hibp:${prefix}:${suffix}`;
      const cachedResult = await this.cacheService.get<{
        isBreached: boolean;
        breachCount: number;
      }>(cacheKey, { namespace: 'security' });

      if (cachedResult !== null) {
        this.logger.debug(`HIBP cache hit for prefix ${prefix}`);
        return { ...cachedResult, cached: true };
      }

      // Step 4: Query HIBP API with prefix only (k-anonymity)
      const response = await this.fetchWithTimeout(
        `${this.HIBP_API_URL}${prefix}`,
        this.API_TIMEOUT_MS,
      );

      if (!response.ok) {
        this.logger.warn(
          `HIBP API returned ${response.status}. Allowing password (fail open).`,
        );
        return { isBreached: false, breachCount: 0, cached: false };
      }

      const responseText = await response.text();

      // Step 5: Parse response and check for our suffix
      const result = this.parseHIBPResponse(responseText, suffix);

      // Step 6: Cache the result
      // Cache both safe and breached passwords to reduce API calls
      await this.cacheService.set(
        cacheKey,
        { isBreached: result.isBreached, breachCount: result.breachCount },
        { ttl: this.CACHE_TTL_SECONDS, namespace: 'security' },
      );

      if (result.isBreached) {
        this.logger.log(
          `Password found in ${result.breachCount} breaches (prefix: ${prefix})`,
        );
      }

      return { ...result, cached: false };
    } catch (error) {
      // Fail open: Don't block user registration due to API failure
      this.logger.error(
        `HIBP check failed: ${error instanceof Error ? error.message : 'Unknown error'}. Allowing password (fail open).`,
      );
      return { isBreached: false, breachCount: 0, cached: false };
    }
  }

  /**
   * Parse HIBP response and check if our suffix is in the list.
   * Response format: "SUFFIX:COUNT\r\nSUFFIX:COUNT\r\n..."
   */
  private parseHIBPResponse(
    responseText: string,
    targetSuffix: string,
  ): { isBreached: boolean; breachCount: number } {
    const lines = responseText.split('\r\n');

    for (const line of lines) {
      const [suffix, countStr] = line.split(':');
      if (suffix && suffix.toUpperCase() === targetSuffix) {
        const count = parseInt(countStr, 10) || 0;
        return { isBreached: true, breachCount: count };
      }
    }

    return { isBreached: false, breachCount: 0 };
  }

  /**
   * Fetch with timeout to prevent hanging on slow API responses.
   */
  private async fetchWithTimeout(
    url: string,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Zenith-PM-Backend', // HIBP requires User-Agent
          'Add-Padding': 'true', // Add padding to prevent response size analysis
        },
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get a user-friendly message for breached passwords.
   */
  getBreachMessage(breachCount: number): string {
    if (breachCount > 1000000) {
      return `This password has appeared in over 1 million data breaches and is extremely unsafe. Please choose a different password.`;
    } else if (breachCount > 10000) {
      return `This password has appeared in over ${Math.floor(breachCount / 1000)}K data breaches. Please choose a different password.`;
    } else if (breachCount > 0) {
      return `This password has appeared in ${breachCount} data breach${breachCount > 1 ? 'es' : ''}. Please choose a different password.`;
    }
    return 'This password may have been exposed. Please choose a different password.';
  }
}

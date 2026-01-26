import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CacheService } from '../../cache/cache.service';
import { randomBytes, timingSafeEqual } from 'crypto';

/**
 * CSRF Token Service
 *
 * SECURITY DESIGN:
 * - Uses cryptographically secure random tokens (32 bytes = 256 bits)
 * - Timing-safe comparison to prevent timing attacks
 * - Multi-tab safe (reuses existing token within TTL)
 * - User-bound tokens (keyed by userId)
 *
 * DEFENSE IN DEPTH:
 * - Service validates userId even if controller guard fails
 * - This prevents tokens being generated for anonymous requests
 */
@Injectable()
export class CsrfService {
  private readonly logger = new Logger(CsrfService.name);
  private readonly TOKEN_TTL = 3600; // 1 hour

  constructor(private readonly cache: CacheService) {}

  /**
   * Generate or retrieve existing CSRF token for user
   *
   * MULTI-TAB SAFE: Returns existing token if still valid
   *
   * DEFENSE IN DEPTH:
   * This method validates userId even if the controller guard somehow fails.
   * If a developer accidentally removes @UseGuards(JwtAuthGuard), this will still block.
   *
   * @param userId - The authenticated user's ID (REQUIRED)
   * @throws InternalServerErrorException if userId is missing
   */
  async generateToken(userId: string): Promise<string> {
    // ==========================================================================
    // DEFENSE IN DEPTH: Validate user context
    // ==========================================================================
    // This check is intentionally redundant with the controller guard.
    // If the guard is removed, this service MUST still refuse to generate tokens.
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      this.logger.error(
        'SECURITY: CSRF token generation attempted without valid userId',
      );
      throw new InternalServerErrorException(
        'CSRF Token generation requires authenticated user context',
      );
    }

    const cacheKey = `csrf:${userId}`;

    // Check for existing valid token (MULTI-TAB FIX)
    const existingToken = await this.cache.get<string>(cacheKey);
    if (existingToken) {
      // Refresh TTL on access to prevent timeout during active session
      await this.cache.set(cacheKey, existingToken, { ttl: this.TOKEN_TTL });
      return existingToken;
    }

    // Generate new token only if none exists
    // 32 bytes = 256 bits of entropy (cryptographically secure)
    const newToken = randomBytes(32).toString('hex');
    await this.cache.set(cacheKey, newToken, { ttl: this.TOKEN_TTL });

    this.logger.debug(
      `CSRF token generated for user ${userId.substring(0, 8)}...`,
    );

    return newToken;
  }

  /**
   * Invalidate token (for logout or security events)
   *
   * Should be called when:
   * - User logs out
   * - User changes password
   * - Suspicious activity detected
   */
  async invalidateToken(userId: string): Promise<void> {
    if (!userId) {
      return; // Silently skip if no userId
    }

    const cacheKey = `csrf:${userId}`;
    await this.cache.del(cacheKey);

    this.logger.debug(
      `CSRF token invalidated for user ${userId.substring(0, 8)}...`,
    );
  }

  /**
   * Validate CSRF token with timing-safe comparison
   *
   * SECURITY:
   * - Uses timing-safe comparison to prevent timing attacks
   * - Returns false for any invalid input (fail-closed)
   * - Logs validation failures for security monitoring
   */
  async validateToken(userId: string, providedToken: string): Promise<boolean> {
    // Fail-closed: missing inputs = invalid
    if (!providedToken || !userId) {
      return false;
    }

    const cacheKey = `csrf:${userId}`;
    const storedToken = await this.cache.get<string>(cacheKey);

    if (!storedToken) {
      this.logger.debug(
        `CSRF validation failed: no stored token for user ${userId.substring(0, 8)}...`,
      );
      return false;
    }

    try {
      const storedBuffer = Buffer.from(storedToken, 'utf8');
      const providedBuffer = Buffer.from(providedToken, 'utf8');

      // Length check before timing-safe comparison
      // (timingSafeEqual requires equal lengths)
      if (storedBuffer.length !== providedBuffer.length) {
        return false;
      }

      return timingSafeEqual(storedBuffer, providedBuffer);
    } catch (error) {
      this.logger.error('CSRF token comparison error', error);
      return false; // Fail-closed
    }
  }
}

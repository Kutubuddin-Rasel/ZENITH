import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service';

/**
 * Token Blacklist Service
 *
 * Implements Redis-based token revocation for immediate invalidation of JWTs.
 *
 * Use Cases:
 * - User logout (instant token invalidation)
 * - Password change (revoke all previous tokens)
 * - Admin ban/revocation
 *
 * Security Model:
 * - Each JWT contains a unique JTI (JWT ID)
 * - On revocation, JTI is added to Redis with TTL = token's remaining lifetime
 * - JwtStrategy checks blacklist on every request
 * - Redis entries auto-expire when token would have naturally expired
 *
 * Storage Efficiency:
 * - Key format: `blacklist:{jti}`
 * - Value: "1" (minimal storage)
 * - TTL matches remaining token validity
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly NAMESPACE = 'token_blacklist';

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Add a token to the blacklist.
   * Uses atomic SET with EX for race-condition free operation.
   *
   * @param jti - The JWT ID (unique identifier in the token)
   * @param expiresAt - Token expiration timestamp (from JWT 'exp' claim)
   * @returns true if successfully blacklisted, false if already expired or error
   */
  async blacklistToken(jti: string, expiresAt: number): Promise<boolean> {
    try {
      // Calculate remaining TTL in seconds
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const remainingSeconds = expiresAt - nowInSeconds;

      // Don't blacklist already-expired tokens
      if (remainingSeconds <= 0) {
        this.logger.debug(`Token ${jti} already expired, skipping blacklist`);
        return false;
      }

      // Add to blacklist with exact TTL
      // Using CacheService.set which internally uses Redis SET with EX
      await this.cacheService.set(
        `blacklist:${jti}`,
        '1', // Minimal value - we only care about key existence
        {
          ttl: remainingSeconds,
          namespace: this.NAMESPACE,
        },
      );

      this.logger.log(`Token ${jti} blacklisted for ${remainingSeconds}s`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to blacklist token ${jti}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Fail closed for security - if we can't blacklist, log error
      // In production, you might want to throw this error
      return false;
    }
  }

  /**
   * Check if a token is blacklisted.
   * Called on every authenticated request by JwtStrategy.
   *
   * @param jti - The JWT ID to check
   * @returns true if token is blacklisted (should be rejected), false if valid
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    try {
      if (!jti) {
        // Legacy tokens without JTI - allow for backwards compatibility
        // In strict mode, you could reject these
        return false;
      }

      const result = await this.cacheService.get(`blacklist:${jti}`, {
        namespace: this.NAMESPACE,
      });

      return result !== null;
    } catch (error) {
      this.logger.error(
        `Failed to check blacklist for ${jti}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Fail closed for security - if Redis is down, reject the token
      // This prevents token use during Redis outages
      return true;
    }
  }

  /**
   * Blacklist multiple tokens at once (batch operation).
   * Useful when revoking all user sessions on password change.
   *
   * @param tokens - Array of { jti, expiresAt } objects
   * @returns Number of tokens successfully blacklisted
   */
  async blacklistMultiple(
    tokens: Array<{ jti: string; expiresAt: number }>,
  ): Promise<number> {
    let count = 0;

    // Process in parallel for efficiency
    const results = await Promise.all(
      tokens.map((token) => this.blacklistToken(token.jti, token.expiresAt)),
    );

    count = results.filter((success) => success).length;
    this.logger.log(`Blacklisted ${count}/${tokens.length} tokens`);

    return count;
  }

  /**
   * Get blacklist statistics (for monitoring/debugging).
   * Note: Returns Promise for API consistency, but current impl is sync.
   */
  getStats(): Promise<{ activeBlacklistEntries: number }> {
    // Note: This would require additional Redis commands like KEYS or SCAN
    // For now, we return a placeholder. In production, use Redis SCAN
    return Promise.resolve({
      activeBlacklistEntries: -1, // Not implemented
    });
  }
}

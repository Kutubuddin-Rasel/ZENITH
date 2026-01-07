import { Injectable } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service';
import { randomBytes, timingSafeEqual } from 'crypto';

@Injectable()
export class CsrfService {
  private readonly TOKEN_TTL = 3600; // 1 hour

  constructor(private readonly cache: CacheService) {}

  /**
   * Generate or retrieve existing CSRF token for user
   * MULTI-TAB SAFE: Returns existing token if still valid
   */
  async generateToken(userId: string): Promise<string> {
    const cacheKey = `csrf:${userId}`;

    // Check for existing valid token (MULTI-TAB FIX)
    const existingToken = await this.cache.get<string>(cacheKey);
    if (existingToken) {
      // Refresh TTL on access to prevent timeout during active session
      await this.cache.set(cacheKey, existingToken, { ttl: this.TOKEN_TTL });
      return existingToken;
    }

    // Generate new token only if none exists
    const newToken = randomBytes(32).toString('hex');
    await this.cache.set(cacheKey, newToken, { ttl: this.TOKEN_TTL });

    return newToken;
  }

  /**
   * Invalidate token (for logout or security events)
   */
  async invalidateToken(userId: string): Promise<void> {
    const cacheKey = `csrf:${userId}`;
    await this.cache.del(cacheKey);
  }

  /**
   * Validate CSRF token with timing-safe comparison
   */
  async validateToken(userId: string, providedToken: string): Promise<boolean> {
    if (!providedToken || !userId) {
      return false;
    }

    const cacheKey = `csrf:${userId}`;
    const storedToken = await this.cache.get<string>(cacheKey);

    if (!storedToken) {
      return false;
    }

    try {
      const storedBuffer = Buffer.from(storedToken, 'utf8');
      const providedBuffer = Buffer.from(providedToken, 'utf8');

      if (storedBuffer.length !== providedBuffer.length) {
        return false;
      }

      return timingSafeEqual(storedBuffer, providedBuffer);
    } catch {
      return false;
    }
  }
}

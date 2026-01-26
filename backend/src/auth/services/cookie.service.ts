import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import * as crypto from 'crypto';
import { AuthConfig } from '../../config/auth.config';

/**
 * CookieService - Modern SPA Token Architecture
 *
 * Implements the security model recommended by Auth0/OWASP (2024):
 * - Access token: In-memory only (returned in response body, stored in JS memory)
 * - Refresh token: HttpOnly cookie (XSS-resistant, auto-sent on /auth routes)
 * - CSRF token: Non-HttpOnly cookie (SPA reads it, sends as header)
 *
 * This pattern minimizes XSS attack surface while protecting against CSRF.
 */
@Injectable()
export class CookieService {
  private readonly isProduction: boolean;
  private readonly cookieDomain: string | undefined;
  private readonly refreshTokenTtlMs: number;
  private readonly cookieSameSite: 'strict' | 'lax' | 'none';
  private readonly cookieSecure: boolean;

  constructor(private configService: ConfigService) {
    this.isProduction = configService.get('NODE_ENV') === 'production';

    // Load from typed auth configuration
    const authConfig = configService.get<AuthConfig>('auth');
    this.cookieDomain =
      authConfig?.cookie.domain || configService.get('COOKIE_DOMAIN');
    this.refreshTokenTtlMs =
      (authConfig?.cookie.refreshTokenTtlDays || 7) * 24 * 60 * 60 * 1000;
    this.cookieSecure = authConfig?.cookie.secure ?? this.isProduction;
    this.cookieSameSite =
      authConfig?.cookie.sameSite || (this.isProduction ? 'strict' : 'lax');
  }

  /**
   * Set refresh token cookie (HttpOnly) and CSRF token cookie (readable by JS).
   *
   * IMPORTANT: Access token is NOT set as cookie - it's returned in response body only.
   * Frontend stores it in memory, which clears on page refresh/close.
   *
   * @param res - Express Response object
   * @param refreshToken - The refresh token to store securely
   * @returns The CSRF token that was set (for including in response if needed)
   */
  setRefreshTokenCookie(res: Response, refreshToken: string): string {
    // Refresh token cookie - HttpOnly, only sent to /auth routes
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: this.cookieSameSite,
      maxAge: this.refreshTokenTtlMs,
      path: '/auth', // Only sent to auth endpoints
      domain: this.cookieDomain,
    });

    // Generate and set CSRF token (readable by frontend)
    const csrfToken = this.generateCsrfToken();
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, // Must be readable by JavaScript
      secure: this.cookieSecure,
      sameSite: this.cookieSameSite,
      maxAge: this.refreshTokenTtlMs, // Same as refresh token
      path: '/',
      domain: this.cookieDomain,
    });

    return csrfToken;
  }

  /**
   * Clear all authentication cookies on logout
   */
  clearAuthCookies(res: Response): void {
    res.clearCookie('refresh_token', {
      path: '/auth',
      domain: this.cookieDomain,
    });
    res.clearCookie('csrf_token', {
      path: '/',
      domain: this.cookieDomain,
    });
  }

  /**
   * Extract access token from Bearer header.
   * Cookie-based access token is no longer supported.
   */
  extractAccessToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  /**
   * Extract refresh token from HttpOnly cookie
   */
  extractRefreshToken(req: Request): string | null {
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    return cookies?.refresh_token ?? null;
  }

  /**
   * Extract CSRF token from cookie
   */
  extractCsrfTokenFromCookie(req: Request): string | null {
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    return cookies?.csrf_token ?? null;
  }

  /**
   * Extract CSRF token from request header
   */
  extractCsrfTokenFromHeader(req: Request): string | null {
    return (req.headers['x-csrf-token'] as string) ?? null;
  }

  /**
   * Validate CSRF token (header must match cookie)
   * Uses timing-safe comparison to prevent timing attacks
   */
  validateCsrfToken(req: Request): boolean {
    const cookieToken = this.extractCsrfTokenFromCookie(req);
    const headerToken = this.extractCsrfTokenFromHeader(req);

    if (!cookieToken || !headerToken) {
      return false;
    }

    // Timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(cookieToken),
        Buffer.from(headerToken),
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate a cryptographically secure CSRF token
   */
  private generateCsrfToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

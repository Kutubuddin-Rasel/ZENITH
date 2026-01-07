import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import * as crypto from 'crypto';

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

  constructor(private configService: ConfigService) {
    this.isProduction = configService.get('NODE_ENV') === 'production';
    this.cookieDomain = configService.get('COOKIE_DOMAIN');
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
    const sameSite: 'strict' | 'lax' | 'none' = this.isProduction
      ? 'strict'
      : 'lax';
    const secure = this.isProduction;

    // Refresh token cookie - HttpOnly, only sent to /auth routes
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/auth', // Only sent to auth endpoints
      domain: this.cookieDomain,
    });

    // Generate and set CSRF token (readable by frontend)
    const csrfToken = this.generateCsrfToken();
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, // Must be readable by JavaScript
      secure,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000, // Same as refresh token
      path: '/',
      domain: this.cookieDomain,
    });

    return csrfToken;
  }

  /**
   * @deprecated Use setRefreshTokenCookie() instead.
   * Kept for backward compatibility during migration.
   */
  setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    // During migration: still set both for backward compatibility
    // TODO: Remove access_token cookie after frontend migration complete
    const sameSite: 'strict' | 'lax' | 'none' = this.isProduction
      ? 'strict'
      : 'lax';
    const secure = this.isProduction;

    // Access token cookie (DEPRECATED - will be removed)
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 15 * 60 * 1000,
      path: '/',
      domain: this.cookieDomain,
    });

    // Refresh token cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth',
      domain: this.cookieDomain,
    });

    // CSRF token (new)
    const csrfToken = this.generateCsrfToken();
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      domain: this.cookieDomain,
    });
  }

  /**
   * Clear all authentication cookies on logout
   */
  clearAuthCookies(res: Response): void {
    res.clearCookie('access_token', {
      path: '/',
      domain: this.cookieDomain,
    });
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
   * Extract access token from request.
   * Priority: Bearer header > Cookie (for migration period)
   */
  extractAccessToken(req: Request): string | null {
    // Check Bearer header first (modern SPA pattern)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Fallback: Cookie (for migration compatibility)
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    return cookies?.access_token ?? null;
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

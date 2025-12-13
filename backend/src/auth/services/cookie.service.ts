import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';

/**
 * CookieService
 * Centralized service for managing authentication cookies
 * Supports dual-mode auth (cookie + bearer fallback)
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
   * Set HttpOnly authentication cookies
   */
  setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    const sameSite = this.isProduction ? 'strict' : 'lax';
    const secure = this.isProduction;

    // Access token cookie - short-lived, sent with all requests
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/',
      domain: this.cookieDomain,
    });

    // Refresh token cookie - long-lived, only sent to /auth routes
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/auth',
      domain: this.cookieDomain,
    });
  }

  /**
   * Clear authentication cookies on logout
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
  }

  /**
   * Extract access token from cookie
   * Bearer token support has been deprecated
   */
  extractAccessToken(req: Request): string | null {
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    return cookies?.access_token ?? null;
  }

  /**
   * Extract refresh token from request
   * Priority: Cookie > Request body (for backward compatibility)
   */
  extractRefreshToken(req: Request): string | null {
    // Check cookie first (new secure path)
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    const cookieToken = cookies?.refresh_token;
    if (cookieToken) {
      return cookieToken;
    }

    return null;
  }
}

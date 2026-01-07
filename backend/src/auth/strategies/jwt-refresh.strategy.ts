import { Injectable, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

interface JwtPayload {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  name: string;
  organizationId?: string;
}

/**
 * JWT Refresh Strategy - Modern SPA Pattern
 *
 * Extracts refresh token from HttpOnly cookie (NOT Bearer header).
 *
 * Security benefits:
 * - HttpOnly cookie is invisible to JavaScript (XSS-resistant)
 * - Cookie is only sent to /auth path (minimizes exposure)
 * - Combined with CSRF token validation for double protection
 *
 * The token is extracted from the cookie and passed to the service
 * for rotation and reuse detection.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(cfg: ConfigService) {
    // SECURITY: Must throw if secret not configured - no fallbacks allowed
    const refreshSecret = cfg.getOrThrow<string>('JWT_REFRESH_SECRET');

    super({
      // Extract from HttpOnly cookie - more secure than Bearer header
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const cookies = req.cookies as
            | Record<string, string | undefined>
            | undefined;
          return cookies?.refresh_token ?? null;
        },
      ]),
      secretOrKey: refreshSecret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload) {
    // Extract the raw refresh token from cookie for rotation/reuse detection
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    const refreshToken = cookies?.refresh_token;

    if (!refreshToken) {
      throw new ForbiddenException('Refresh token not found');
    }

    // CSRF validation is handled at the controller/guard level
    // This strategy just validates the JWT and extracts the token

    return {
      ...payload,
      refreshToken,
    };
  }
}

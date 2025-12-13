import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { CookieService } from '../services/cookie.service';
import { JwtRequestUser } from '../types/jwt-request-user.interface';

/**
 * JWT Cookie Strategy
 *
 * Dual-mode authentication strategy that:
 * 1. Tries to extract JWT from HttpOnly cookie first
 * 2. Falls back to Authorization Bearer header for backward compatibility
 *
 * This enables zero-downtime migration from localStorage to cookie auth.
 */
@Injectable()
export class JwtCookieStrategy extends PassportStrategy(
  Strategy,
  'jwt-cookie',
) {
  constructor(
    configService: ConfigService,
    private readonly cookieService: CookieService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: (req: Request) => cookieService.extractAccessToken(req),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtRequestUser): JwtRequestUser {
    // Payload already contains user info from JWT
    return {
      userId: payload.userId,
      email: payload.email,
      isSuperAdmin: payload.isSuperAdmin,
      organizationId: payload.organizationId,
      name: payload.name,
    };
  }
}

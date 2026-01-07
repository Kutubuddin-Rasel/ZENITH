import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

interface JwtPayload {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  name: string;
  organizationId?: string;
}

/**
 * JWT Strategy - Modern SPA Pattern
 *
 * Extracts access token from:
 * 1. Authorization: Bearer header (primary - modern SPA)
 * 2. access_token cookie (fallback - migration compatibility)
 *
 * The Bearer pattern is recommended for SPAs because:
 * - Access token stored in memory (cleared on page close)
 * - XSS can only steal token during page lifetime
 * - No CSRF protection needed (not auto-sent like cookies)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: ConfigService,
    private readonly usersService: UsersService,
  ) {
    // SECURITY: Fail if JWT_SECRET not configured
    const secret = cfg.getOrThrow<string>('JWT_SECRET');

    const opts: StrategyOptions = {
      // Extract from Bearer header first, fallback to cookie for migration
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Primary: Bearer token header (modern SPA pattern)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Fallback: Cookie (for migration period, will be removed)
        (request: Express.Request) => {
          const cookies = (request as { cookies?: Record<string, string> })
            .cookies;
          return cookies?.access_token ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    };
    super(opts);
  }

  async validate(payload: JwtPayload) {
    // Verify user still exists and is active
    try {
      const user = await this.usersService.findOneById(payload.userId);
      if (!user.isActive) {
        throw new UnauthorizedException('User is inactive');
      }
    } catch {
      throw new UnauthorizedException('User no longer exists');
    }

    return {
      id: payload.userId,
      userId: payload.userId,
      email: payload.email,
      isSuperAdmin: payload.isSuperAdmin,
      name: payload.name,
      organizationId: payload.organizationId,
    };
  }
}

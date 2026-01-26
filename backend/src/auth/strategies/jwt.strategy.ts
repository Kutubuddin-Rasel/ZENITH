import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { JwtPayload } from '../types/jwt-request-user.interface';

/**
 * JWT Strategy - Modern SPA Pattern with Token Blacklist
 *
 * Extracts access token from Authorization: Bearer header only.
 *
 * Security Features:
 * - Token blacklist check (instant revocation on logout/password change)
 * - Password version validation (invalidates tokens after password change)
 * - User existence and active status verification
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
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    // SECURITY: Fail if JWT_SECRET not configured
    const secret = cfg.getOrThrow<string>('JWT_SECRET');

    const opts: StrategyOptions = {
      // Bearer token header only (modern SPA pattern)
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    };
    super(opts);
  }

  async validate(payload: JwtPayload) {
    // SECURITY CHECK 1: Token Blacklist
    // Check if this specific token has been revoked (logout, admin ban, etc.)
    if (payload.jti) {
      const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(
        payload.jti,
      );
      if (isBlacklisted) {
        throw new UnauthorizedException(
          'Token has been revoked. Please login again.',
        );
      }
    }

    // SECURITY CHECK 2: User Existence and Status
    // Verify user still exists and is active
    // Define expected user properties for type safety
    interface ValidatedUser {
      isActive: boolean;
      passwordVersion?: number;
    }

    let user: ValidatedUser;
    try {
      const foundUser = await this.usersService.findOneById(payload.userId);
      user = foundUser as ValidatedUser;
      if (!user.isActive) {
        throw new UnauthorizedException('User is inactive');
      }
    } catch {
      throw new UnauthorizedException('User no longer exists');
    }

    // SECURITY CHECK 3: Password Version (Session Invalidation)
    // If token's passwordVersion < user's current passwordVersion, reject
    // This ensures all old tokens are invalidated when password changes
    if (
      payload.passwordVersion !== undefined &&
      user.passwordVersion !== undefined &&
      payload.passwordVersion < user.passwordVersion
    ) {
      throw new UnauthorizedException(
        'Token invalidated due to password change. Please login again.',
      );
    }

    // Return user context for request handlers
    return {
      id: payload.userId,
      userId: payload.userId,
      email: payload.email,
      isSuperAdmin: payload.isSuperAdmin,
      name: payload.name,
      organizationId: payload.organizationId,
      jti: payload.jti, // Include JTI for logout
      exp: payload.exp, // Include expiration for logout
    };
  }
}

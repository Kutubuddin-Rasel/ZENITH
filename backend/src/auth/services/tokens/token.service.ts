import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { UsersService } from '../../../users/users.service';
import { AuthConfig } from '../../../config/auth.config';
import { TokenBlacklistService } from '../token-blacklist.service';
import {
  AccessTokenClaims,
  ITokenIssuer,
  ITokenRevoker,
  ITokenVerifier,
  TokenPair,
  TwoFactorSessionClaims,
} from '../../interfaces/token.interfaces';
import { AuthPrincipal } from '../../interfaces/core.interfaces';
import { JwtRequestUser } from '../../types/jwt-request-user.interface';
import { parseDurationToSeconds } from '../core/duration.util';

const TWO_FA_PURPOSE = '2fa_verification' as const;

/**
 * Step 3 — Token lifecycle service extracted from the legacy `AuthService`.
 *
 * Implements {@link ITokenIssuer}, {@link ITokenVerifier}, {@link ITokenRevoker}.
 * Owns JWT minting, refresh-token rotation, the short-lived 2FA session
 * token, and the bridge to the existing {@link TokenBlacklistService}.
 */
@Injectable()
export class TokenService
  implements ITokenIssuer, ITokenVerifier, ITokenRevoker
{
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  // ── ITokenIssuer ─────────────────────────────────────────────────────

  async issuePair(principal: AuthPrincipal): Promise<TokenPair> {
    const accessJti = uuidv4();
    const refreshJti = uuidv4();

    const accessPayload: JwtRequestUser = {
      userId: principal.id,
      email: principal.email,
      isSuperAdmin: principal.isSuperAdmin,
      organizationId: principal.organizationId,
      name: principal.name,
      passwordVersion: principal.passwordVersion,
      jti: accessJti,
    };

    const refreshPayload: JwtRequestUser = {
      ...accessPayload,
      jti: refreshJti,
    };

    const authConfig = this.configService.get<AuthConfig>('auth');
    const accessExpiry = authConfig?.jwt.accessTokenExpiry || '15m';
    const refreshExpiry = authConfig?.jwt.refreshTokenExpiry || '7d';

    const accessExpirySeconds = parseDurationToSeconds(accessExpiry);
    const refreshExpirySeconds = parseDurationToSeconds(refreshExpiry);

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ ...accessPayload }, {
        secret: this.configService.get<string>('JWT_SECRET')!,
        expiresIn: accessExpirySeconds,
      } as JwtSignOptions),
      this.jwtService.signAsync({ ...refreshPayload }, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET')!,
        expiresIn: refreshExpirySeconds,
      } as JwtSignOptions),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async issueTwoFactorSession(userId: string, email: string): Promise<string> {
    const payload = {
      userId,
      email,
      purpose: TWO_FA_PURPOSE,
      iat: Math.floor(Date.now() / 1000),
    };

    const authConfig = this.configService.get<AuthConfig>('auth');
    const twoFactorSessionExpiry =
      authConfig?.jwt.twoFactorSessionExpiry || '5m';
    const expirySeconds = parseDurationToSeconds(twoFactorSessionExpiry);

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn: expirySeconds,
    } as JwtSignOptions);
  }

  // ── ITokenVerifier ───────────────────────────────────────────────────

  verifyAccess(token: string): Promise<AccessTokenClaims> {
    return this.verifyClaims(token, 'JWT_SECRET');
  }

  verifyRefresh(token: string): Promise<AccessTokenClaims> {
    return this.verifyClaims(token, 'JWT_REFRESH_SECRET');
  }

  async verifyTwoFactorSession(token: string): Promise<TwoFactorSessionClaims> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        userId: string;
        email: string;
        purpose: string;
        iat?: number;
        exp?: number;
      }>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      if (payload.purpose !== TWO_FA_PURPOSE) {
        throw new UnauthorizedException('Invalid session token');
      }

      return {
        userId: payload.userId,
        email: payload.email,
        purpose: TWO_FA_PURPOSE,
        iat: payload.iat,
        exp: payload.exp,
      };
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired 2FA session. Please login again.',
      );
    }
  }

  // ── ITokenRevoker ────────────────────────────────────────────────────

  async revoke(jti: string, expiresAtEpochSeconds: number): Promise<void> {
    await this.tokenBlacklistService.blacklistToken(jti, expiresAtEpochSeconds);
  }

  isRevoked(jti: string): Promise<boolean> {
    return this.tokenBlacklistService.isBlacklisted(jti);
  }

  // ── Refresh-token rotation (extra public surface) ───────────────────

  /**
   * Rotate refresh tokens. Detects reuse — if the supplied token does not
   * match the stored bcrypt hash, every refresh token for the user is
   * invalidated immediately.
   */
  async refreshTokens(
    userId: string,
    refreshToken: string,
  ): Promise<TokenPair> {
    const user = await this.usersService.findOneById(userId);

    if (!user || !user.hashedRefreshToken) {
      throw new ForbiddenException('Access Denied');
    }

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );

    if (!tokenMatches) {
      // SECURITY: token reuse detected — wipe all refresh credentials.
      await this.usersService.update(userId, { hashedRefreshToken: null });
      throw new ForbiddenException('Access Denied - Token Reuse Detected');
    }

    const tokens = await this.issuePair({
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      isActive: user.isActive,
      organizationId: user.organizationId,
      passwordVersion: user.passwordVersion,
    });
    await this.updateRefreshToken(user.id, tokens.refresh_token);

    return tokens;
  }

  /** Persist a bcrypt hash of the current refresh token. */
  async updateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.update(userId, { hashedRefreshToken: hash });
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private async verifyClaims(
    token: string,
    secretKey: 'JWT_SECRET' | 'JWT_REFRESH_SECRET',
  ): Promise<AccessTokenClaims> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtRequestUser>(token, {
        secret: this.configService.getOrThrow<string>(secretKey),
      });
      return {
        userId: payload.userId,
        email: payload.email,
        isSuperAdmin: payload.isSuperAdmin,
        name: payload.name,
        organizationId: payload.organizationId,
        passwordVersion: payload.passwordVersion,
        jti: payload.jti,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt'; // Used for refresh token hashing only
import { UsersService } from '../users/users.service';
import { InvitesService } from '../invites/invites.service';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { OnboardingService } from '../onboarding/services/onboarding.service';
import { PasswordService } from './services/password.service';
import { RegisterDto } from './dto/register.dto';
import { SafeUser } from './types/safe-user.interface';
import { JwtRequestUser } from './types/jwt-request-user.interface';
import { RedeemInviteDto } from './dto/redeem-invite.dto';
import { AuditLogsService } from '../audit/audit-logs.service';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';
import { AuthConfig } from '../config/auth.config';
import { CacheService } from '../cache/cache.service';
import { PasswordBreachService } from './services/password-breach.service';
import { TokenBlacklistService } from './services/token-blacklist.service';

// Argon2id = version 3 (see passwordVersion column in User entity)
const ARGON2ID_VERSION = 3;

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private invitesService: InvitesService,
    private projectMembersService: ProjectMembersService,
    private organizationsService: OrganizationsService,
    private onboardingService: OnboardingService,
    private configService: ConfigService,
    private passwordService: PasswordService,
    private auditLogsService: AuditLogsService,
    private cls: ClsService,
    private cacheService: CacheService,
    private passwordBreachService: PasswordBreachService,
    private tokenBlacklistService: TokenBlacklistService,
  ) { }

  // Validate credentials for LocalStrategy
  async validateUser(
    email: string,
    pass: string,
    ipAddress?: string,
  ): Promise<SafeUser | null> {
    const user = await this.usersService.findOneByEmail(email.toLowerCase());
    if (!user || !user.isActive) {
      // Audit: LOGIN_FAILED (user not found)
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: 'unknown',
        actor_id: 'unknown',
        actor_ip: ipAddress,
        resource_type: 'User',
        resource_id: email,
        action_type: 'LOGIN',
        action: 'LOGIN_FAILED',
        metadata: {
          reason: 'User not found or inactive',
          email,
          requestId: this.cls.get<string>('requestId'),
        },
      });
      return null;
    }

    // CHECK LOCKOUT FIRST (Timing Attack Prevention)
    if (await this.isAccountLocked(user.id)) {
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: user.organizationId || 'unknown',
        actor_id: user.id,
        actor_ip: ipAddress,
        resource_type: 'User',
        resource_id: user.id,
        action_type: 'LOGIN',
        action: 'LOGIN_LOCKED',
        metadata: {
          reason: 'Account locked due to too many failed attempts',
          email,
          requestId: this.cls.get<string>('requestId'),
        },
      });
      return null;
    }

    // Verify password using Argon2id
    const isValid = await this.passwordService.verify(pass, user.passwordHash);
    if (!isValid) {
      // Record failed attempt and check if threshold reached
      const attempts = await this.recordFailedAttempt(user.id);

      const action =
        attempts >= this.getMaxAttempts() ? 'LOGIN_LOCKED' : 'LOGIN_FAILED';
      const reason =
        attempts >= this.getMaxAttempts()
          ? 'Account locked after failed attempts'
          : 'Invalid password';

      // Audit: LOGIN_FAILED or LOGIN_LOCKED
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: user.organizationId || 'unknown',
        actor_id: user.id,
        actor_ip: ipAddress,
        resource_type: 'User',
        resource_id: user.id,
        action_type: 'LOGIN',
        action: action,
        metadata: {
          reason,
          email,
          attempts,
          requestId: this.cls.get<string>('requestId'),
        },
      });
      return null;
    }

    // Success - Clear any existing lockout
    await this.clearLockout(user.id);

    // strip passwordHash before returning

    const { passwordHash, hashedRefreshToken, ...result } = user;
    return result as SafeUser;
  }

  // Issue Access and Refresh Tokens
  async login(user: SafeUser, ipAddress?: string) {
    const tokens = await this.getTokens(
      user.id,
      user.email,
      user.isSuperAdmin,
      user.organizationId,
      user.name,
      user.passwordVersion,
    );
    await this.updateRefreshToken(user.id, tokens.refresh_token);

    // Audit: LOGIN_SUCCESS
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: user.organizationId || 'unknown',
      actor_id: user.id,
      actor_ip: ipAddress,
      resource_type: 'User',
      resource_id: user.id,
      action_type: 'LOGIN',
      action: 'LOGIN_SUCCESS',
      metadata: {
        email: user.email,
        requestId: this.cls.get<string>('requestId'),
      },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperAdmin: user.isSuperAdmin,
        organizationId: user.organizationId,
      },
    };
  }

  /**
   * Main registration method.
   */
  async register(dto: RegisterDto): Promise<SafeUser> {
    const existing = await this.usersService.findOneByEmail(
      dto.email.toLowerCase(),
    );
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    // Check password against known breaches (HIBP API - k-anonymity)
    const breachCheck = await this.passwordBreachService.checkPassword(
      dto.password,
    );
    if (breachCheck.isBreached) {
      throw new BadRequestException(
        this.passwordBreachService.getBreachMessage(breachCheck.breachCount),
      );
    }

    // Use Argon2id for new registrations
    const hash = await this.passwordService.hash(dto.password);

    // If workspaceName provided, create organization
    let organizationId: string | undefined;
    let isSuperAdmin = false;

    if (dto.workspaceName) {
      const organization = await this.organizationsService.create({
        name: dto.workspaceName,
      });
      organizationId = organization.id;
      isSuperAdmin = true; // First user of workspace is Super Admin
    }

    const user = await this.usersService.create(
      dto.email.toLowerCase(),
      hash,
      dto.name,
      isSuperAdmin,
      organizationId,
      undefined, // defaultRole
      ARGON2ID_VERSION, // Track password version (Argon2id)
    );

    // Initialize onboarding for the new user
    await this.onboardingService.initializeOnboarding(user.id);

    return user;
  }

  /**
   * Called when a user accepts an invite.
   */
  async redeemInvite(dto: RedeemInviteDto): Promise<{
    access_token: string;
    refresh_token: string;
    user: {
      id: string;
      email: string;
      name: string;
      isSuperAdmin: boolean;
      organizationId?: string;
    };
  }> {
    const invite = await this.invitesService.findOneByToken(dto.token);
    if (
      !invite ||
      invite.status !== 'Pending' ||
      (invite.expiresAt && invite.expiresAt < new Date())
    ) {
      throw new BadRequestException('Invite is invalid or has expired.');
    }

    const user = await this.usersService.findOneById(invite.inviteeId);
    if (!user) {
      throw new Error('Invitee user does not exist. Cannot redeem invite.');
    }

    await this.invitesService.respondToInvite(invite.id, user.id, true);


    const { passwordHash, hashedRefreshToken, ...safeUser } = user;
    return this.login(safeUser as SafeUser);
  }

  /**
   * Find user by ID for 2FA verification
   */
  async findUserById(userId: string): Promise<SafeUser> {
    const user = await this.usersService.findOneById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }


    const { passwordHash, hashedRefreshToken, ...safeUser } = user;
    return safeUser as SafeUser;
  }

  /**
   * Logout user by removing refresh token and blacklisting access token
   * @param userId - User ID
   * @param accessTokenJti - JTI of the access token to blacklist
   * @param accessTokenExp - Expiration of the access token
   */
  async logout(
    userId: string,
    accessTokenJti?: string,
    accessTokenExp?: number,
  ): Promise<void> {
    // Clear refresh token from database
    await this.usersService.update(userId, { hashedRefreshToken: null });

    // Blacklist access token if JTI is provided
    if (accessTokenJti && accessTokenExp) {
      await this.tokenBlacklistService.blacklistToken(
        accessTokenJti,
        accessTokenExp,
      );
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findOneById(userId);

    // Impact: Reuse Detection
    // If user has no refresh token, access is denied.
    if (!user || !user.hashedRefreshToken) {
      throw new ForbiddenException('Access Denied');
    }

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );

    if (!tokenMatches) {
      // SECURITY CRITICAL: Token Reuse Detected!
      // The provided refresh token is valid (checked by guard/strategy) but does not match the current database hash.
      // This implies an old token is being used (likely stolen).
      // Action: Invalidate ALL tokens for this user immediately.
      await this.usersService.update(userId, { hashedRefreshToken: null });
      throw new ForbiddenException('Access Denied - Token Reuse Detected');
    }

    const tokens = await this.getTokens(
      user.id,
      user.email,
      user.isSuperAdmin,
      user.organizationId,
      user.name,
      user.passwordVersion,
    );
    await this.updateRefreshToken(user.id, tokens.refresh_token);

    return tokens;
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.update(userId, {
      hashedRefreshToken: hash,
    });
  }

  async getTokens(
    userId: string,
    email: string,
    isSuperAdmin: boolean,
    organizationId: string | undefined,
    name: string,
    passwordVersion?: number,
  ) {
    // Generate unique JTI for each token (for blacklist/revocation)
    const accessJti = uuidv4();
    const refreshJti = uuidv4();

    const accessPayload: JwtRequestUser = {
      userId,
      email,
      isSuperAdmin,
      organizationId,
      name,
      passwordVersion,
      jti: accessJti,
    };

    const refreshPayload: JwtRequestUser = {
      userId,
      email,
      isSuperAdmin,
      organizationId,
      name,
      passwordVersion,
      jti: refreshJti,
    };

    // Get token expiry from typed configuration
    const authConfig = this.configService.get<AuthConfig>('auth');
    const accessTokenExpiry = authConfig?.jwt.accessTokenExpiry || '15m';
    const refreshTokenExpiry = authConfig?.jwt.refreshTokenExpiry || '7d';

    // Convert duration strings to seconds for @nestjs/jwt v11 compatibility
    // @nestjs/jwt v11 requires expiresIn as number (seconds) or StringValue (branded type)
    const accessExpirySeconds = this.parseDurationToSeconds(accessTokenExpiry);
    const refreshExpirySeconds =
      this.parseDurationToSeconds(refreshTokenExpiry);

    // Spread payloads to plain objects for TypeScript overload resolution
    // @nestjs/jwt v11 has stricter type checks on payload types
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

  /**
   * Generate a short-lived signed token for 2FA verification step.
   * This token cryptographically binds the 2FA verification to the original login attempt,
   * preventing attackers from substituting arbitrary userIds.
   *
   * SECURITY: This token is ONLY valid for completing 2FA, not for accessing resources.
   */
  async generate2FASessionToken(
    userId: string,
    email: string,
  ): Promise<string> {
    const payload = {
      userId,
      email,
      purpose: '2fa_verification', // Clearly scoped purpose
      iat: Math.floor(Date.now() / 1000),
    };

    // Get 2FA session expiry from typed configuration
    const authConfig = this.configService.get<AuthConfig>('auth');
    const twoFactorSessionExpiry =
      authConfig?.jwt.twoFactorSessionExpiry || '5m';
    const expirySeconds = this.parseDurationToSeconds(twoFactorSessionExpiry);

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn: expirySeconds,
    } as JwtSignOptions);
  }

  /**
   * Verify and decode a 2FA session token.
   * Returns the userId if valid, throws if invalid/expired.
   *
   * SECURITY: Only trusts userId from this signed token, not from client body.
   */
  async verify2FASessionToken(
    token: string,
  ): Promise<{ userId: string; email: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        userId: string;
        email: string;
        purpose: string;
      }>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      // Verify this token was issued for 2FA verification purpose
      if (payload.purpose !== '2fa_verification') {
        throw new UnauthorizedException('Invalid session token');
      }

      return {
        userId: payload.userId,
        email: payload.email,
      };
    } catch (_error) {
      throw new UnauthorizedException(
        'Invalid or expired 2FA session. Please login again.',
      );
    }
  }

  // --- Lockout Helper Methods ---

  private getMaxAttempts(): number {
    const authConfig = this.configService.get<AuthConfig>('auth');
    return authConfig?.lockout?.maxAttempts || 5;
  }

  private getLockoutTtl(lockoutCount: number = 0): number {
    const authConfig = this.configService.get<AuthConfig>('auth');
    const initialSeconds = authConfig?.lockout?.initialLockoutSeconds || 900;
    const multiplier = authConfig?.lockout?.backoffMultiplier || 2;
    const maxSeconds = authConfig?.lockout?.maxLockoutSeconds || 3600;

    // Exponential backoff: initialSeconds * (multiplier ^ lockoutCount)
    const calculatedTtl = Math.floor(
      initialSeconds * Math.pow(multiplier, lockoutCount),
    );
    return Math.min(calculatedTtl, maxSeconds);
  }

  async isAccountLocked(userId: string): Promise<boolean> {
    const attempts = await this.cacheService.get<number>(`lockout:${userId}`, {
      namespace: 'auth',
    });
    return (attempts || 0) >= this.getMaxAttempts();
  }

  async recordFailedAttempt(userId: string): Promise<number> {
    // Get current lockout count for exponential backoff
    const lockoutCount =
      (await this.cacheService.get<number>(`lockout_count:${userId}`, {
        namespace: 'auth',
      })) || 0;

    const ttl = this.getLockoutTtl(lockoutCount);
    const attempts = await this.cacheService.incr(`lockout:${userId}`, {
      ttl,
      namespace: 'auth',
    });

    // If this attempt triggers lockout, increment lockout count for next time
    if (attempts >= this.getMaxAttempts()) {
      await this.cacheService.incr(`lockout_count:${userId}`, {
        ttl: 86400, // 24 hour window for lockout count
        namespace: 'auth',
      });
    }

    return attempts;
  }

  async clearLockout(userId: string): Promise<void> {
    await this.cacheService.del(`lockout:${userId}`, { namespace: 'auth' });
    // Note: We don't clear lockout_count here - it resets naturally via TTL
    // This ensures repeat offenders get progressively longer lockouts
  }

  async unlockAccount(userId: string, adminUserId: string): Promise<void> {
    await this.clearLockout(userId);
    // Also clear lockout count on manual unlock (admin decision to reset)
    await this.cacheService.del(`lockout_count:${userId}`, {
      namespace: 'auth',
    });

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: 'system',
      actor_id: adminUserId,
      resource_type: 'User',
      resource_id: userId,
      action_type: 'UPDATE',
      action: 'ACCOUNT_UNLOCKED',
      metadata: {
        reason: 'Manual unlock by admin',
        unlockedBy: adminUserId,
      },
    });
  }

  // --- Duration Parsing Utility ---

  /**
   * Parse a duration string (e.g., '15m', '7d', '1h') to seconds.
   * Required for @nestjs/jwt v11 which expects expiresIn as number (seconds).
   *
   * Supported formats:
   * - 's' for seconds (e.g., '30s' = 30)
   * - 'm' for minutes (e.g., '15m' = 900)
   * - 'h' for hours (e.g., '1h' = 3600)
   * - 'd' for days (e.g., '7d' = 604800)
   *
   * @param duration - Duration string
   * @returns Duration in seconds
   */
  private parseDurationToSeconds(duration: string): number {
    const match = duration.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) {
      // Fallback: assume it's already seconds or default to 15 minutes
      const num = parseInt(duration, 10);
      return isNaN(num) ? 900 : num;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        return 900; // Default 15 minutes
    }
  }
}

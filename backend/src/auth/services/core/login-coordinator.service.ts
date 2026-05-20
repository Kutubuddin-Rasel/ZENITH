import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';

import { UsersService } from '../../../users/users.service';
import { AuditLogsService } from '../../../audit/audit-logs.service';
import { LoginHistoryService } from '../../login-history/login-history.service';
import { PasswordService } from '../password.service';
import { TokenBlacklistService } from '../token-blacklist.service';
import { TokenService } from '../tokens/token.service';
import { ACCOUNT_LOCKOUT_POLICY_TOKEN } from '../../constants/auth.tokens';
import { IAccountLockoutPolicy } from '../../interfaces/core.interfaces';
import { SafeUser } from '../../types/safe-user.interface';
import { TokenPair } from '../../interfaces/token.interfaces';

interface LoginResponse extends TokenPair {
  user: {
    id: string;
    email: string;
    name: string;
    isSuperAdmin: boolean;
    organizationId?: string;
  };
}

const UNKNOWN_IP = '0.0.0.0';

/**
 * Step 3 — Login / logout orchestrator extracted from the legacy
 * `AuthService`.
 *
 * Coordinates credential validation, account-lockout enforcement, token
 * issuance, refresh-token rotation, and audit / login-history emission.
 */
@Injectable()
export class LoginCoordinator {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    @Inject(ACCOUNT_LOCKOUT_POLICY_TOKEN)
    private readonly lockoutPolicy: IAccountLockoutPolicy,
    private readonly tokenService: TokenService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly auditLogsService: AuditLogsService,
    private readonly loginHistoryService: LoginHistoryService,
    private readonly cls: ClsService,
  ) {}

  /** Local-credential validation entry-point for `LocalStrategy`. */
  async validateUser(
    email: string,
    password: string,
    ipAddress?: string,
  ): Promise<SafeUser | null> {
    const user = await this.usersService.findOneByEmail(email.toLowerCase());
    if (!user || !user.isActive) {
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

    if (await this.lockoutPolicy.isLocked(user.id)) {
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
      await this.loginHistoryService.recordAttempt({
        userId: user.id,
        ipAddress: ipAddress ?? UNKNOWN_IP,
        userAgent: null,
        deviceFingerprint: null,
        success: false,
        failureReason: 'account_locked',
        organizationId: user.organizationId ?? null,
      });
      return null;
    }

    const isValid = await this.passwordService.verify(
      password,
      user.passwordHash,
    );
    if (!isValid) {
      const attempts = await this.lockoutPolicy.recordFailure(user.id);
      const max = this.lockoutPolicy.getMaxAttempts();
      const action = attempts >= max ? 'LOGIN_LOCKED' : 'LOGIN_FAILED';
      const reason =
        attempts >= max
          ? 'Account locked after failed attempts'
          : 'Invalid password';

      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: user.organizationId || 'unknown',
        actor_id: user.id,
        actor_ip: ipAddress,
        resource_type: 'User',
        resource_id: user.id,
        action_type: 'LOGIN',
        action,
        metadata: {
          reason,
          email,
          attempts,
          requestId: this.cls.get<string>('requestId'),
        },
      });
      await this.loginHistoryService.recordAttempt({
        userId: user.id,
        ipAddress: ipAddress ?? UNKNOWN_IP,
        userAgent: null,
        deviceFingerprint: null,
        success: false,
        failureReason: 'invalid_password',
        organizationId: user.organizationId ?? null,
      });
      return null;
    }

    await this.lockoutPolicy.clear(user.id);

    await this.loginHistoryService.recordAttempt({
      userId: user.id,
      ipAddress: ipAddress ?? UNKNOWN_IP,
      userAgent: null,
      deviceFingerprint: null,
      success: true,
      failureReason: null,
      organizationId: user.organizationId ?? null,
    });

    const { passwordHash: _hash, hashedRefreshToken: _rt, ...safeUser } = user;
    return safeUser as SafeUser;
  }

  /** Issue tokens for an already-validated principal and audit the event. */
  async login(user: SafeUser, ipAddress?: string): Promise<LoginResponse> {
    const tokens = await this.tokenService.issuePair(user);
    await this.tokenService.updateRefreshToken(user.id, tokens.refresh_token);

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

  /** Clear the refresh-token hash and optionally blacklist the access JTI. */
  async logout(
    userId: string,
    accessTokenJti?: string,
    accessTokenExp?: number,
  ): Promise<void> {
    await this.usersService.update(userId, { hashedRefreshToken: null });

    if (accessTokenJti && accessTokenExp) {
      await this.tokenBlacklistService.blacklistToken(
        accessTokenJti,
        accessTokenExp,
      );
    }
  }
}

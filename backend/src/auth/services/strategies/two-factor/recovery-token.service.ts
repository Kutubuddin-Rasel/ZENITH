import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';

import { TwoFactorAuthRepository } from '../../../repositories/abstract/two-factor-auth.repository.abstract';
import { AuthUserRepository } from '../../../repositories/abstract/auth-user.repository.abstract';
import { AuditService } from '../../../../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../../../../audit/entities/audit-log.entity';
import { SYSTEM_TENANT_ID } from '../../../../audit/audit.constants';
import {
  I2FARecoveryService,
  RecoveryTokenIssued,
  RecoveryVerificationResult,
} from '../../../interfaces/two-factor.interfaces';

const RECOVERY_TOKEN_TTL_MS = 15 * 60 * 1000;
const RECOVERY_TOKEN_LENGTH = 64;
const RECOVERY_TOKEN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const GENERIC_RECOVERY_MESSAGE =
  'If an account exists with this email and has 2FA enabled, a recovery link has been sent.';

/**
 * Step 4 — Email-based 2FA recovery flow. Issues a SHA-256-hashed,
 * single-use, 15-minute token; redemption disables 2FA.
 *
 * Public surface mirrors {@link I2FARecoveryService}. Audit events feed
 * the security-incident pipeline.
 */
@Injectable()
export class RecoveryTokenService implements I2FARecoveryService {
  constructor(
    private readonly twoFactorRepo: TwoFactorAuthRepository,
    private readonly userRepo: AuthUserRepository,
    private readonly auditService: AuditService,
  ) {}

  async issueRecoveryToken(email: string): Promise<RecoveryTokenIssued> {
    const user = await this.userRepo.findByEmail(email.toLowerCase());

    // Do not leak account existence — generic 200 for the bad paths.
    if (!user) {
      return { success: true, message: GENERIC_RECOVERY_MESSAGE };
    }

    const twoFactorAuth = await this.twoFactorRepo.findEnabledByUserId(user.id);
    if (!twoFactorAuth) {
      return { success: true, message: GENERIC_RECOVERY_MESSAGE };
    }

    const token = this.generateSecureToken();
    const hashedToken = createHash('sha256').update(token).digest('hex');

    twoFactorAuth.recoveryToken = hashedToken;
    twoFactorAuth.recoveryTokenExpiresAt = new Date(
      Date.now() + RECOVERY_TOKEN_TTL_MS,
    );
    await this.twoFactorRepo.save(twoFactorAuth);

    await this.auditService.logSecurityEvent(
      user.organizationId || SYSTEM_TENANT_ID,
      AuditEventType.PASSWORD_RESET,
      `2FA recovery token generated`,
      user.id,
      email,
      user.name,
      undefined,
      undefined,
      { action: 'two_fa_recovery_token_generated' },
      AuditSeverity.MEDIUM,
    );

    return {
      success: true,
      message: GENERIC_RECOVERY_MESSAGE,
      token, // Emitted ONLY for email delivery; never exposed to the client.
      userId: user.id,
    };
  }

  async redeemRecoveryToken(
    email: string,
    token: string,
  ): Promise<RecoveryVerificationResult> {
    const user = await this.userRepo.findByEmail(email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException('Invalid or expired recovery link');
    }

    const twoFactorAuth = await this.twoFactorRepo.findByUserId(user.id);
    if (!twoFactorAuth || !twoFactorAuth.recoveryToken) {
      throw new UnauthorizedException('Invalid or expired recovery link');
    }

    if (
      twoFactorAuth.recoveryTokenExpiresAt &&
      twoFactorAuth.recoveryTokenExpiresAt < new Date()
    ) {
      twoFactorAuth.recoveryToken = null;
      twoFactorAuth.recoveryTokenExpiresAt = null;
      await this.twoFactorRepo.save(twoFactorAuth);
      throw new UnauthorizedException('Recovery link has expired');
    }

    const hashedToken = createHash('sha256').update(token).digest('hex');
    if (hashedToken !== twoFactorAuth.recoveryToken) {
      throw new UnauthorizedException('Invalid or expired recovery link');
    }

    await this.twoFactorRepo.remove(twoFactorAuth);

    await this.auditService.logSecurityEvent(
      user.organizationId || SYSTEM_TENANT_ID,
      AuditEventType.TWO_FA_DISABLED,
      `2FA disabled via recovery`,
      user.id,
      email,
      undefined,
      undefined,
      undefined,
      { action: 'recovery_completed' },
      AuditSeverity.HIGH,
    );

    return {
      success: true,
      message:
        'Two-factor authentication has been disabled. You can now log in with just your password.',
      userId: user.id,
    };
  }

  private generateSecureToken(): string {
    let result = '';
    for (let i = 0; i < RECOVERY_TOKEN_LENGTH; i++) {
      result += RECOVERY_TOKEN_ALPHABET.charAt(
        randomInt(RECOVERY_TOKEN_ALPHABET.length),
      );
    }
    return result;
  }
}

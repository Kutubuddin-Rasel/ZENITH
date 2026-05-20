import { Injectable } from '@nestjs/common';

import { TwoFactorAuthRepository } from '../../../repositories/abstract/two-factor-auth.repository.abstract';
import { AuthUserRepository } from '../../../repositories/abstract/auth-user.repository.abstract';
import { AuditService } from '../../../../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../../../../audit/entities/audit-log.entity';
import { SYSTEM_TENANT_ID } from '../../../../audit/audit.constants';
import {
  AdminResetResult,
  I2FAAdminService,
  TwoFactorStatus,
} from '../../../interfaces/two-factor.interfaces';

/**
 * Step 4 — Super-admin 2FA operations. Hard-isolated from the normal-user
 * surface so non-admin call-sites can never inject it.
 */
@Injectable()
export class TwoFactorAdminService implements I2FAAdminService {
  constructor(
    private readonly twoFactorRepo: TwoFactorAuthRepository,
    private readonly userRepo: AuthUserRepository,
    private readonly auditService: AuditService,
  ) {}

  async reset(
    targetUserId: string,
    adminUserId: string,
    reason?: string,
  ): Promise<AdminResetResult> {
    const twoFactorAuth = await this.twoFactorRepo.findByUserId(targetUserId);
    if (!twoFactorAuth) {
      return {
        success: false,
        message: 'User does not have 2FA configured',
      };
    }

    await this.twoFactorRepo.remove(twoFactorAuth);

    const targetUser = await this.userRepo.findById(targetUserId);
    await this.auditService.logSecurityEvent(
      targetUser?.organizationId || SYSTEM_TENANT_ID,
      AuditEventType.TWO_FA_DISABLED,
      `Admin reset 2FA for user`,
      targetUserId,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        adminUserId,
        targetUserId,
        reason: reason || 'Not specified',
        action: 'admin_reset',
      },
      AuditSeverity.HIGH,
    );

    return {
      success: true,
      message: 'Two-factor authentication has been disabled for this user',
    };
  }

  async getStatusFor(userId: string): Promise<TwoFactorStatus> {
    const twoFactorAuth = await this.twoFactorRepo.findByUserId(userId);
    if (!twoFactorAuth) {
      return {
        isEnabled: false,
        hasBackupCodes: false,
        backupCodeCount: 0,
        lastUsedAt: null,
      };
    }

    const hashedCodes = JSON.parse(
      twoFactorAuth.backupCodes ?? '[]',
    ) as string[];

    return {
      isEnabled: twoFactorAuth.isEnabled,
      hasBackupCodes: hashedCodes.length > 0,
      backupCodeCount: hashedCodes.length,
      lastUsedAt: twoFactorAuth.lastUsedAt,
    };
  }
}

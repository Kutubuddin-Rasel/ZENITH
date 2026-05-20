import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TwoFactorAuthRepository } from '../../../repositories/abstract/two-factor-auth.repository.abstract';
import { AuthConfig } from '../../../../config/auth.config';
import { I2FABackupCodeService } from '../../../interfaces/two-factor.interfaces';
import { generateBackupCodes } from './backup-code.util';

const DEFAULT_RECOVERY_CODE_COUNT = 10;

/**
 * Step 4 — Out-of-band backup-code rotation. Wipes the existing hashed
 * code set and returns the freshly-issued plaintext codes (shown once).
 */
@Injectable()
export class BackupCodeService implements I2FABackupCodeService {
  private readonly logger = new Logger(BackupCodeService.name);
  private readonly recoveryCodeCount: number;

  constructor(
    private readonly twoFactorRepo: TwoFactorAuthRepository,
    private readonly configService: ConfigService,
  ) {
    const authConfig = this.configService.get<AuthConfig>('auth');
    this.recoveryCodeCount =
      authConfig?.twoFactor.recoveryCodeCount ?? DEFAULT_RECOVERY_CODE_COUNT;
  }

  async regenerate(userId: string): Promise<ReadonlyArray<string>> {
    const twoFactorAuth = await this.twoFactorRepo.findEnabledByUserId(userId);
    if (!twoFactorAuth) {
      throw new BadRequestException('Two-factor authentication not enabled');
    }

    const { plaintextCodes, hashedCodes } = await generateBackupCodes(
      this.recoveryCodeCount,
    );

    twoFactorAuth.backupCodes = JSON.stringify(hashedCodes);
    await this.twoFactorRepo.save(twoFactorAuth);

    this.logger.log(`Backup codes regenerated for user ${userId}`);
    return plaintextCodes;
  }
}

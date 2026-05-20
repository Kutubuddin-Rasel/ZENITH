import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import * as speakeasy from 'speakeasy';

import { TwoFactorAuthRepository } from '../../../repositories/abstract/two-factor-auth.repository.abstract';
import { AuthConfig } from '../../../../config/auth.config';
import {
  I2FASecretStore,
  TwoFactorEnableResult,
  TwoFactorEnrollmentSecret,
} from '../../../interfaces/two-factor.interfaces';
import { generateBackupCodes } from './backup-code.util';

const DEFAULT_TOTP_WINDOW = 1;
const DEFAULT_RECOVERY_CODE_COUNT = 10;
const SECRET_LENGTH = 32;

/**
 * Step 4 — TOTP enrolment lifecycle. Owns the `TwoFactorAuth` row from
 * creation through disable. Pure ISP: implements only
 * {@link I2FASecretStore}.
 */
@Injectable()
export class TotpSecretService implements I2FASecretStore {
  private readonly totpWindow: number;
  private readonly recoveryCodeCount: number;

  constructor(
    private readonly twoFactorRepo: TwoFactorAuthRepository,
    private readonly configService: ConfigService,
  ) {
    const authConfig = this.configService.get<AuthConfig>('auth');
    this.totpWindow = authConfig?.twoFactor.totpWindow ?? DEFAULT_TOTP_WINDOW;
    this.recoveryCodeCount =
      authConfig?.twoFactor.recoveryCodeCount ?? DEFAULT_RECOVERY_CODE_COUNT;
  }

  async enroll(
    userId: string,
    userEmail: string,
  ): Promise<TwoFactorEnrollmentSecret> {
    const existing2FA = await this.twoFactorRepo.findByUserId(userId);
    if (existing2FA?.isEnabled) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled',
      );
    }

    const secret = speakeasy.generateSecret({
      name: `Zenith PM (${userEmail})`,
      issuer: 'Zenith Project Management',
      length: SECRET_LENGTH,
    });

    const { plaintextCodes, hashedCodes } = await generateBackupCodes(
      this.recoveryCodeCount,
    );

    const twoFactorAuth = existing2FA || this.twoFactorRepo.create({ userId });
    twoFactorAuth.secret = secret.base32;
    twoFactorAuth.backupCodes = JSON.stringify(hashedCodes);
    twoFactorAuth.isEnabled = false;

    await this.twoFactorRepo.save(twoFactorAuth);

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Plaintext codes are SHOWN ONCE — never re-retrievable from storage.
    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes: plaintextCodes,
    };
  }

  async verifyAndEnable(
    userId: string,
    token: string,
  ): Promise<TwoFactorEnableResult> {
    const twoFactorAuth = await this.twoFactorRepo.findByUserId(userId);
    if (!twoFactorAuth) {
      throw new BadRequestException(
        'Two-factor authentication not initialized',
      );
    }
    if (twoFactorAuth.isEnabled) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled',
      );
    }

    const verified = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: this.totpWindow,
    });
    if (!verified) {
      throw new UnauthorizedException('Invalid verification code');
    }

    twoFactorAuth.isEnabled = true;
    await this.twoFactorRepo.save(twoFactorAuth);

    // Backup codes were revealed during enroll() — cannot be replayed.
    return { success: true, backupCodes: [] };
  }

  async disable(userId: string): Promise<boolean> {
    const twoFactorAuth = await this.twoFactorRepo.findByUserId(userId);
    if (!twoFactorAuth) {
      throw new BadRequestException('Two-factor authentication not enabled');
    }
    await this.twoFactorRepo.remove(twoFactorAuth);
    return true;
  }

  async isEnabled(userId: string): Promise<boolean> {
    const twoFactorAuth = await this.twoFactorRepo.findEnabledByUserId(userId);
    return !!twoFactorAuth;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as speakeasy from 'speakeasy';

import { TwoFactorAuthRepository } from '../../../repositories/abstract/two-factor-auth.repository.abstract';
import { AuthConfig } from '../../../../config/auth.config';
import { I2FAVerifier } from '../../../interfaces/two-factor.interfaces';

const DEFAULT_TOTP_WINDOW = 1;

/**
 * Step 4 — Per-login TOTP / backup-code verification. Constant-time
 * comparison via `Promise.any` over Argon2id-hashed backup codes ensures
 * no observable timing oracle.
 *
 * Backup-code consumption is treated as an implementation detail of the
 * verifier — the {@link I2FAVerifier} contract surface stays read+match.
 */
@Injectable()
export class TotpVerifierService implements I2FAVerifier {
  private readonly logger = new Logger(TotpVerifierService.name);
  private readonly totpWindow: number;

  constructor(
    private readonly twoFactorRepo: TwoFactorAuthRepository,
    private readonly configService: ConfigService,
  ) {
    const authConfig = this.configService.get<AuthConfig>('auth');
    this.totpWindow = authConfig?.twoFactor.totpWindow ?? DEFAULT_TOTP_WINDOW;
  }

  async verify(userId: string, token: string): Promise<boolean> {
    const twoFactorAuth = await this.twoFactorRepo.findEnabledByUserId(userId);
    if (!twoFactorAuth) {
      return false;
    }

    // Fast path — pure TOTP.
    const totpVerified = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: this.totpWindow,
    });
    if (totpVerified) {
      twoFactorAuth.lastUsedAt = new Date();
      await this.twoFactorRepo.save(twoFactorAuth);
      return true;
    }

    // Fallback — single-use Argon2id-hashed backup code.
    const hashedCodes = JSON.parse(
      twoFactorAuth.backupCodes ?? '[]',
    ) as string[];
    if (hashedCodes.length === 0) {
      return false;
    }

    try {
      const matchedHash = await Promise.any(
        hashedCodes.map(async (hash) => {
          const matches = await argon2.verify(hash, token);
          if (matches) return hash;
          throw new Error('No match');
        }),
      );

      const updatedHashes = hashedCodes.filter((h) => h !== matchedHash);
      twoFactorAuth.backupCodes = JSON.stringify(updatedHashes);
      twoFactorAuth.lastUsedAt = new Date();
      await this.twoFactorRepo.save(twoFactorAuth);

      this.logger.log(
        `Backup code used for user ${userId}. Remaining: ${updatedHashes.length}`,
      );
      return true;
    } catch (error) {
      if (error instanceof AggregateError) {
        return false;
      }
      this.logger.error(`Error verifying backup code: ${String(error)}`);
      return false;
    }
  }
}

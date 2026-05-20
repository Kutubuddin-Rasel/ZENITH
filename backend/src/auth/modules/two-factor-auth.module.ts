import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '../../audit/audit.module';
import { AuthCoreModule } from './auth-core.module';

import { TwoFactorAuth } from '../entities/two-factor-auth.entity';

import { TotpSecretService } from '../services/strategies/two-factor/totp-secret.service';
import { TotpVerifierService } from '../services/strategies/two-factor/totp-verifier.service';
import { BackupCodeService } from '../services/strategies/two-factor/backup-code.service';
import { RecoveryTokenService } from '../services/strategies/two-factor/recovery-token.service';
import { TwoFactorAdminService } from '../services/strategies/two-factor/two-factor-admin.service';
import { TwoFactorAuthController } from '../controllers/two-factor-auth.controller';

import { TwoFactorAuthRepository } from '../repositories/abstract/two-factor-auth.repository.abstract';
import { PostgresTwoFactorAuthRepository } from '../repositories/concrete/postgres-two-factor-auth.repository';

import {
  TWO_FACTOR_ADMIN_SERVICE_TOKEN,
  TWO_FACTOR_BACKUP_CODE_SERVICE_TOKEN,
  TWO_FACTOR_RECOVERY_SERVICE_TOKEN,
  TWO_FACTOR_SECRET_STORE_TOKEN,
  TWO_FACTOR_VERIFIER_TOKEN,
} from '../constants/auth.tokens';

/**
 * Step 5 — Two-Factor Authentication sub-module.
 *
 * Houses the 5 segregated 2FA services (TOTP secret store, verifier,
 * backup-code rotation, recovery-token flow, admin reset) plus the
 * {@link TwoFactorAuthRepository} DIP binding and the
 * `TwoFactorAuthController` endpoints.
 *
 * Depends on {@link AuthCoreModule} for the {@link AuthUserRepository}
 * consumed by the recovery flow.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TwoFactorAuth]),
    AuditModule,
    AuthCoreModule,
  ],
  providers: [
    TotpSecretService,
    { provide: TWO_FACTOR_SECRET_STORE_TOKEN, useExisting: TotpSecretService },
    TotpVerifierService,
    { provide: TWO_FACTOR_VERIFIER_TOKEN, useExisting: TotpVerifierService },
    BackupCodeService,
    {
      provide: TWO_FACTOR_BACKUP_CODE_SERVICE_TOKEN,
      useExisting: BackupCodeService,
    },
    RecoveryTokenService,
    {
      provide: TWO_FACTOR_RECOVERY_SERVICE_TOKEN,
      useExisting: RecoveryTokenService,
    },
    TwoFactorAdminService,
    {
      provide: TWO_FACTOR_ADMIN_SERVICE_TOKEN,
      useExisting: TwoFactorAdminService,
    },
    {
      provide: TwoFactorAuthRepository,
      useClass: PostgresTwoFactorAuthRepository,
    },
  ],
  controllers: [TwoFactorAuthController],
  exports: [
    TWO_FACTOR_SECRET_STORE_TOKEN,
    TWO_FACTOR_VERIFIER_TOKEN,
    TWO_FACTOR_BACKUP_CODE_SERVICE_TOKEN,
    TWO_FACTOR_RECOVERY_SERVICE_TOKEN,
    TWO_FACTOR_ADMIN_SERVICE_TOKEN,
  ],
})
export class TwoFactorAuthModule {}

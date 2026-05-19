import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import { CsrfGuard, RequireCsrf } from '../../security/csrf/csrf.guard';
import { Verify2FADto, VerifyLogin2FADto } from '../dto/two-factor-auth.dto';
import {
  TWO_FACTOR_ADMIN_SERVICE_TOKEN,
  TWO_FACTOR_BACKUP_CODE_SERVICE_TOKEN,
  TWO_FACTOR_RECOVERY_SERVICE_TOKEN,
  TWO_FACTOR_SECRET_STORE_TOKEN,
  TWO_FACTOR_VERIFIER_TOKEN,
} from '../constants/auth.tokens';
import {
  I2FAAdminService,
  I2FABackupCodeService,
  I2FARecoveryService,
  I2FASecretStore,
  I2FAVerifier,
} from '../interfaces/two-factor.interfaces';

/**
 * Two-Factor Authentication Controller
 *
 * Step 4 — now consumes the five ISP-segregated 2FA services through their
 * dedicated DI tokens. The legacy monolithic `TwoFactorAuthService` is
 * gone; each handler depends only on the contract it actually exercises.
 *
 * SECURITY:
 * - All authenticated endpoints require JwtAuthGuard
 * - State-changing handlers require CSRF protection
 * - Recovery endpoints are public but heavily rate-limited
 */
@Controller('auth/2fa')
@UseGuards(JwtAuthGuard, CsrfGuard)
export class TwoFactorAuthController {
  private readonly logger = new Logger(TwoFactorAuthController.name);

  constructor(
    @Inject(TWO_FACTOR_SECRET_STORE_TOKEN)
    private readonly secretStore: I2FASecretStore,
    @Inject(TWO_FACTOR_VERIFIER_TOKEN)
    private readonly verifier: I2FAVerifier,
    @Inject(TWO_FACTOR_BACKUP_CODE_SERVICE_TOKEN)
    private readonly backupCodes: I2FABackupCodeService,
    @Inject(TWO_FACTOR_RECOVERY_SERVICE_TOKEN)
    private readonly recovery: I2FARecoveryService,
    @Inject(TWO_FACTOR_ADMIN_SERVICE_TOKEN)
    private readonly admin: I2FAAdminService,
  ) {}

  /** Generate 2FA secret + QR. Read-only — no CSRF. */
  @Post('generate')
  async generate(@Request() req: { user: { userId: string; email: string } }) {
    return this.secretStore.enroll(req.user.userId, req.user.email);
  }

  /** Verify token and ENABLE 2FA. State-changing — CSRF required. */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  async verify(
    @Request() req: { user: { userId: string } },
    @Body() dto: Verify2FADto,
  ) {
    return this.secretStore.verifyAndEnable(req.user.userId, dto.token);
  }

  /** Verify 2FA during an authenticated session. Read+match — no CSRF. */
  @Post('verify-login')
  @HttpCode(HttpStatus.OK)
  async verifyLogin(
    @Request() req: { user: { userId: string } },
    @Body() dto: VerifyLogin2FADto,
  ) {
    const isValid = await this.verifier.verify(req.user.userId, dto.token);
    if (!isValid) {
      return { success: false, message: 'Invalid verification code' };
    }
    return { success: true };
  }

  /** Current 2FA status. Read-only — no CSRF. */
  @Get('status')
  async getStatus(@Request() req: { user: { userId: string } }) {
    const isEnabled = await this.secretStore.isEnabled(req.user.userId);
    return { isEnabled };
  }

  /** Regenerate backup codes. Invalidates existing codes — CSRF required. */
  @Post('regenerate-backup-codes')
  @RequireCsrf()
  async regenerateBackupCodes(@Request() req: { user: { userId: string } }) {
    const backupCodes = await this.backupCodes.regenerate(req.user.userId);
    return { backupCodes };
  }

  /** Disable 2FA. Reduces account security — CSRF required. */
  @Delete('disable')
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  async disable(@Request() req: { user: { userId: string } }) {
    const success = await this.secretStore.disable(req.user.userId);
    return { success };
  }

  // ── Admin endpoints (Super Admin only) ────────────────────────────────

  /** Read 2FA status for any user. No CSRF. */
  @Get('admin/user/:userId/status')
  async getStatusForUser(
    @Param('userId') targetUserId: string,
    @Request() req: { user: { userId: string; isSuperAdmin: boolean } },
  ) {
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException('Super Admin access required');
    }
    return this.admin.getStatusFor(targetUserId);
  }

  /** Reset 2FA for a user. Critical — CSRF required. */
  @Delete('admin/user/:userId/reset')
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  async adminReset(
    @Param('userId') targetUserId: string,
    @Request() req: { user: { userId: string; isSuperAdmin: boolean } },
    @Body() body: { reason?: string },
  ) {
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException('Super Admin access required');
    }
    if (targetUserId === req.user.userId) {
      throw new ForbiddenException(
        'Cannot reset your own 2FA through admin endpoint. Use the disable endpoint instead.',
      );
    }

    return this.admin.reset(targetUserId, req.user.userId, body.reason);
  }

  // ── Public recovery endpoints (rate-limited) ─────────────────────────

  /** Request 2FA recovery via email. Public, throttled to avoid email-bombing. */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @Post('recovery/request')
  @HttpCode(HttpStatus.OK)
  async requestRecovery(@Body() body: { email: string }) {
    const result = await this.recovery.issueRecoveryToken(body.email);

    // TODO: dispatch the recovery link via EmailService. In dev only,
    // log the link so manual QA can complete the flow.
    if (result.token && process.env.NODE_ENV !== 'production') {
      this.logger.debug(
        `[DEV ONLY] Recovery link for ${body.email}: /auth/2fa-recovery?email=${encodeURIComponent(
          body.email,
        )}&token=${result.token}`,
      );
    }

    return { success: result.success, message: result.message };
  }

  /** Verify the email recovery token and disable 2FA. Public, throttled. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('recovery/verify')
  @HttpCode(HttpStatus.OK)
  async verifyRecovery(@Body() body: { email: string; token: string }) {
    return this.recovery.redeemRecoveryToken(body.email, body.token);
  }
}

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
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TwoFactorAuthService } from '../services/two-factor-auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import { CsrfGuard, RequireCsrf } from '../../security/csrf/csrf.guard';
import {
  // Generate2FADto,
  Verify2FADto,
  // Disable2FADto, // Removed - no longer used after simplification
  VerifyLogin2FADto,
} from '../dto/two-factor-auth.dto';

/**
 * Two-Factor Authentication Controller
 *
 * Manages 2FA lifecycle: generate, verify/enable, disable, backup codes.
 *
 * SECURITY:
 * - All authenticated endpoints require JwtAuthGuard
 * - State-changing methods require CSRF protection (Stateful/Redis)
 * - Recovery endpoints are public but heavily rate-limited
 *
 * CSRF PROTECTED METHODS (high-security):
 * - verify (enables 2FA)
 * - disable (disables 2FA)
 * - regenerateBackupCodes (generates new codes, invalidates old)
 */
@Controller('auth/2fa')
@UseGuards(JwtAuthGuard, CsrfGuard)
export class TwoFactorAuthController {
  private readonly logger = new Logger(TwoFactorAuthController.name);

  constructor(private twoFactorAuthService: TwoFactorAuthService) {}

  /**
   * Generate 2FA secret and QR code
   *
   * No CSRF required - read-only, doesn't enable 2FA yet
   */
  @Post('generate')
  async generate(@Request() req: { user: { userId: string; email: string } }) {
    const userId = req.user.userId;
    const userEmail = req.user.email;
    return this.twoFactorAuthService.generateSecret(userId, userEmail);
  }

  /**
   * Verify token and ENABLE 2FA
   *
   * CSRF REQUIRED: State-changing security operation
   * Attacker could enable 2FA with their own authenticator, locking user out
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  async verify(
    @Request() req: { user: { userId: string } },
    @Body() dto: Verify2FADto,
  ) {
    const userId = req.user.userId;
    return this.twoFactorAuthService.verifyAndEnable(userId, dto.token);
  }

  /**
   * Verify 2FA token during authenticated session
   *
   * No CSRF required - verification only, not state-changing
   */
  @Post('verify-login')
  @HttpCode(HttpStatus.OK)
  async verifyLogin(
    @Request() req: { user: { userId: string } },
    @Body() dto: VerifyLogin2FADto,
  ) {
    const userId = req.user.userId;
    const isValid = await this.twoFactorAuthService.verifyToken(
      userId,
      dto.token,
    );
    if (!isValid) {
      return { success: false, message: 'Invalid verification code' };
    }
    return { success: true };
  }

  /**
   * Get current 2FA status
   *
   * No CSRF required - read-only
   */
  @Get('status')
  async getStatus(@Request() req: { user: { userId: string } }) {
    const userId = req.user.userId;
    const isEnabled = await this.twoFactorAuthService.isEnabled(userId);
    return { isEnabled };
  }

  /**
   * Regenerate backup codes
   *
   * CSRF REQUIRED: State-changing security operation
   * Invalidates existing backup codes - could lock user out
   */
  @Post('regenerate-backup-codes')
  @RequireCsrf()
  async regenerateBackupCodes(@Request() req: { user: { userId: string } }) {
    const userId = req.user.userId;
    const backupCodes =
      await this.twoFactorAuthService.regenerateBackupCodes(userId);
    return { backupCodes };
  }

  /**
   * Disable 2FA
   *
   * CSRF REQUIRED: Critical security operation
   * Disabling 2FA reduces account security - must be protected
   */
  @Delete('disable')
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  async disable(@Request() req: { user: { userId: string } }) {
    const success = await this.twoFactorAuthService.disable(req.user.userId);
    return { success };
  }

  // ============ ADMIN ENDPOINTS ============

  /**
   * Get 2FA status for any user (Super Admin only)
   *
   * No CSRF required - read-only
   */
  @Get('admin/user/:userId/status')
  async getStatusForUser(
    @Param('userId') targetUserId: string,
    @Request() req: { user: { userId: string; isSuperAdmin: boolean } },
  ) {
    // Only super admins can view other users' 2FA status
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException('Super Admin access required');
    }

    return this.twoFactorAuthService.getStatusForUser(targetUserId);
  }

  /**
   * Reset 2FA for a user (Super Admin only)
   *
   * CSRF REQUIRED: Critical admin operation
   * Could be used to compromise user accounts
   */
  @Delete('admin/user/:userId/reset')
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  async adminReset(
    @Param('userId') targetUserId: string,
    @Request() req: { user: { userId: string; isSuperAdmin: boolean } },
    @Body() body: { reason?: string },
  ) {
    // Only super admins can reset other users' 2FA
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException('Super Admin access required');
    }

    // Prevent resetting your own 2FA through admin endpoint
    if (targetUserId === req.user.userId) {
      throw new ForbiddenException(
        'Cannot reset your own 2FA through admin endpoint. Use the disable endpoint instead.',
      );
    }

    const result = await this.twoFactorAuthService.adminReset(
      targetUserId,
      req.user.userId,
      body.reason,
    );

    return result;
  }

  // ============ EMAIL RECOVERY ENDPOINTS (Public) ============

  /**
   * Request 2FA recovery via email
   * Called when user clicks "Lost access to authenticator?"
   *
   * PUBLIC endpoint (no auth required - user is locked out!)
   * No CSRF required - public endpoint, no session to hijack
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 per 5 minutes - prevent email bombing
  @Post('recovery/request')
  @HttpCode(HttpStatus.OK)
  async requestRecovery(@Body() body: { email: string }) {
    const result = await this.twoFactorAuthService.generateRecoveryToken(
      body.email,
    );

    // TODO: Send email with recovery link
    // For now, log the token (in development only, NEVER expose in production!)
    if (result.token && process.env.NODE_ENV !== 'production') {
      this.logger.debug(
        `[DEV ONLY] Recovery link for ${body.email}: /auth/2fa-recovery?email=${encodeURIComponent(body.email)}&token=${result.token}`,
      );
    }

    // Return generic message (don't reveal if user exists)
    return {
      success: result.success,
      message: result.message,
    };
  }

  /**
   * Verify recovery token and disable 2FA
   * Called when user clicks the recovery link from email
   *
   * PUBLIC endpoint (no auth required - user is locked out!)
   * No CSRF required - public endpoint, no session
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 per minute - prevent brute force
  @Post('recovery/verify')
  @HttpCode(HttpStatus.OK)
  async verifyRecovery(@Body() body: { email: string; token: string }) {
    return this.twoFactorAuthService.verifyRecoveryToken(
      body.email,
      body.token,
    );
  }
}

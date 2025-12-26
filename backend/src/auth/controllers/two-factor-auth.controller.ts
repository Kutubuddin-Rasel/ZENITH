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
} from '@nestjs/common';
import { TwoFactorAuthService } from '../services/two-factor-auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import {
  // Generate2FADto,
  Verify2FADto,
  // Disable2FADto, // Removed - no longer used after simplification
  VerifyLogin2FADto,
} from '../dto/two-factor-auth.dto';

@Controller('auth/2fa')
@UseGuards(JwtAuthGuard)
export class TwoFactorAuthController {
  constructor(private twoFactorAuthService: TwoFactorAuthService) {}

  @Post('generate')
  async generate(@Request() req: { user: { userId: string; email: string } }) {
    const userId = req.user.userId;
    const userEmail = req.user.email;
    return this.twoFactorAuthService.generateSecret(userId, userEmail);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Request() req: { user: { userId: string } },
    @Body() dto: Verify2FADto,
  ) {
    const userId = req.user.userId;
    return this.twoFactorAuthService.verifyAndEnable(userId, dto.token);
  }

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

  @Get('status')
  async getStatus(@Request() req: { user: { userId: string } }) {
    const userId = req.user.userId;
    const isEnabled = await this.twoFactorAuthService.isEnabled(userId);
    return { isEnabled };
  }

  @Post('regenerate-backup-codes')
  async regenerateBackupCodes(@Request() req: { user: { userId: string } }) {
    const userId = req.user.userId;
    const backupCodes =
      await this.twoFactorAuthService.regenerateBackupCodes(userId);
    return { backupCodes };
  }

  @Delete('disable')
  @HttpCode(HttpStatus.OK)
  async disable(@Request() req: { user: { userId: string } }) {
    const success = await this.twoFactorAuthService.disable(req.user.userId);
    return { success };
  }

  // ============ ADMIN ENDPOINTS ============

  /**
   * Get 2FA status for any user (Super Admin only)
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
   * Use this to help locked-out users regain access
   */
  @Delete('admin/user/:userId/reset')
  @HttpCode(HttpStatus.OK)
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
   * This is a PUBLIC endpoint (no auth required - user is locked out!)
   */
  @Public()
  @Post('recovery/request')
  @HttpCode(HttpStatus.OK)
  async requestRecovery(@Body() body: { email: string }) {
    const result = await this.twoFactorAuthService.generateRecoveryToken(
      body.email,
    );

    // TODO: Send email with recovery link
    // For now, log the token (in production, never expose this!)
    if (result.token) {
      console.log(
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
   * This is a PUBLIC endpoint (no auth required - user is locked out!)
   */
  @Public()
  @Post('recovery/verify')
  @HttpCode(HttpStatus.OK)
  async verifyRecovery(@Body() body: { email: string; token: string }) {
    return this.twoFactorAuthService.verifyRecoveryToken(
      body.email,
      body.token,
    );
  }
}

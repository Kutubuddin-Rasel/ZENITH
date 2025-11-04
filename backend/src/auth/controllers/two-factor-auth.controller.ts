import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TwoFactorAuthService } from '../services/two-factor-auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import {
  // Generate2FADto,
  Verify2FADto,
  Disable2FADto,
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
  async disable(
    @Request() req: { user: { userId: string } },
    @Body() dto: Disable2FADto,
  ) {
    const userId = req.user.userId;
    const success = await this.twoFactorAuthService.disable(
      userId,
      dto.password,
    );
    return { success };
  }
}

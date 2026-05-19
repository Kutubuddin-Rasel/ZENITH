import {
  Controller,
  Post,
  UseGuards,
  Request,
  Res,
  Body,
  Get,
  Param,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LoginCoordinator } from './services/core/login-coordinator.service';
import { RegistrationService } from './services/core/registration.service';
import { TokenService } from './services/tokens/token.service';
import {
  ACCOUNT_LOCKOUT_POLICY_TOKEN,
  TWO_FACTOR_SECRET_STORE_TOKEN,
  TWO_FACTOR_VERIFIER_TOKEN,
} from './constants/auth.tokens';
import { IAccountLockoutPolicy } from './interfaces/core.interfaces';
import {
  I2FASecretStore,
  I2FAVerifier,
} from './interfaces/two-factor.interfaces';
import { CookieService } from './services/cookie.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { RedeemInviteDto } from './dto/redeem-invite.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { Public } from './decorators/public.decorator';
import { VerifyLogin2FADto } from './dto/two-factor-auth.dto';
import { Response } from 'express';
import { SuperAdminGuard } from '../core/auth/guards/super-admin.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginCoordinator: LoginCoordinator,
    private readonly registrationService: RegistrationService,
    private readonly tokenService: TokenService,
    @Inject(ACCOUNT_LOCKOUT_POLICY_TOKEN)
    private readonly lockoutPolicy: IAccountLockoutPolicy,
    @Inject(TWO_FACTOR_SECRET_STORE_TOKEN)
    private readonly twoFactorSecretStore: I2FASecretStore,
    @Inject(TWO_FACTOR_VERIFIER_TOKEN)
    private readonly twoFactorVerifier: I2FAVerifier,
    private cookieService: CookieService,
  ) {}

  // POST /auth/login
  // Rate limit: 5 attempts per minute to prevent brute force
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @Request()
    req: {
      user: {
        id: string;
        email: string;
        name: string;
        isSuperAdmin: boolean;
        isActive: boolean;
      };
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    // LocalStrategy attaches the validated user to req.user
    const result = await this.loginCoordinator.login(req.user);

    // Check if user has 2FA enabled
    const has2FA = await this.twoFactorSecretStore.isEnabled(req.user.id);

    if (has2FA) {
      // SECURITY: Return a signed session token instead of raw userId
      // This prevents attackers from substituting their own userId in the 2FA step
      const twoFactorSessionToken =
        await this.tokenService.issueTwoFactorSession(
          req.user.id,
          req.user.email,
        );

      return {
        requires2FA: true,
        twoFactorSessionToken, // Signed token, not raw userId
        message: 'Please provide your 2FA token to complete login',
      };
    }

    // Set refresh token cookie (access token returned in body only)
    this.cookieService.setRefreshTokenCookie(res, result.refresh_token);

    // Return access token in body (frontend stores in memory)
    return {
      access_token: result.access_token,
      user: result.user,
      message: 'Login successful',
    };
  }

  // POST /auth/verify-2fa-login
  // Rate limit: 5 attempts per minute (same as login - brute force prevention)
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify-2fa-login')
  async verify2FALogin(
    @Body() dto: VerifyLogin2FADto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // SECURITY: Extract userId from signed session token, NOT from request body
    // This prevents attackers from substituting arbitrary userIds
    const { userId } = await this.tokenService.verifyTwoFactorSession(
      dto.twoFactorSessionToken,
    );

    const isValid = await this.twoFactorVerifier.verify(userId, dto.token);

    if (!isValid) {
      return { success: false, message: 'Invalid 2FA token' };
    }

    // Generate final JWT token
    const user = await this.registrationService.findUserById(userId);
    const result = await this.loginCoordinator.login(user);

    // Set refresh token cookie after successful 2FA
    this.cookieService.setRefreshTokenCookie(res, result.refresh_token);

    return {
      access_token: result.access_token,
      user: result.user,
      success: true,
    };
  }

  // POST /auth/register
  // Rate limit: 3 attempts per minute to prevent spam registration
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.registrationService.register(dto);
  }

  @Public()
  @Post('redeem-invite')
  async redeemInvite(
    @Body() dto: RedeemInviteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.registrationService.redeemInvite(dto);

    // Set refresh token cookie for invite redemption
    this.cookieService.setRefreshTokenCookie(res, result.refresh_token);

    return {
      access_token: result.access_token,
      user: result.user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(
    @Request()
    req: {
      user: {
        userId: string;
        email: string;
        isSuperAdmin: boolean;
        name: string;
      };
    },
  ) {
    if (!req?.user?.userId) {
      return null;
    }

    // Fetch fresh user data from DB to get latest avatarUrl and other fields
    const freshUser = await this.registrationService.findUserById(
      req.user.userId,
    );

    return {
      userId: freshUser.id,
      email: freshUser.email,
      name: freshUser.name,
      isSuperAdmin: freshUser.isSuperAdmin,
      avatarUrl: freshUser.avatarUrl,
      organizationId: freshUser.organizationId,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('test-protected')
  testProtected(
    @Request() req: { user: { id: string; email: string; name: string } },
  ) {
    // Debug logging handled by Pino at request level
    return req.user;
  }

  @UseGuards(JwtRefreshAuthGuard, CsrfGuard)
  @Get('refresh')
  async refreshTokens(
    @Request() req: { user: { userId: string; refreshToken: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user['userId'];
    const refreshToken = req.user['refreshToken'];
    const result = await this.tokenService.refreshTokens(userId, refreshToken);

    // Set new refresh token cookie (access token returned in body only)
    this.cookieService.setRefreshTokenCookie(res, result.refresh_token);

    // Return access token in body (SPA stores in memory)
    return {
      access_token: result.access_token,
      expires_in: 900, // 15 minutes in seconds
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @Request() req: { user: { userId: string; jti?: string; exp?: number } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, jti, exp } = req.user;

    // Logout with token blacklisting (if JTI available)
    await this.loginCoordinator.logout(userId, jti, exp);

    // Clear HttpOnly Cookies on logout
    this.cookieService.clearAuthCookies(res);

    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Post('admin/unlock-account/:userId')
  async unlockAccount(
    @Param('userId') userId: string,
    @Request() req: { user: { userId: string } },
  ) {
    await this.lockoutPolicy.unlock(userId, req.user.userId);
    return { message: 'Account unlocked successfully' };
  }
}

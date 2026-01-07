import {
  Controller,
  Post,
  UseGuards,
  Request,
  Res,
  Body,
  Get,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
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

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private twoFactorAuthService: TwoFactorAuthService,
    private cookieService: CookieService,
  ) { }

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
    const result = await this.authService.login(req.user);

    // Check if user has 2FA enabled
    const has2FA = await this.twoFactorAuthService.isEnabled(req.user.id);

    if (has2FA) {
      // SECURITY: Return a signed session token instead of raw userId
      // This prevents attackers from substituting their own userId in the 2FA step
      const twoFactorSessionToken = await this.authService.generate2FASessionToken(
        req.user.id,
        req.user.email,
      );

      return {
        requires2FA: true,
        twoFactorSessionToken, // Signed token, not raw userId
        message: 'Please provide your 2FA token to complete login',
      };
    }

    // Set HttpOnly Cookies using CookieService
    this.cookieService.setAuthCookies(
      res,
      result.access_token,
      result.refresh_token,
    );

    // Also return tokens in body for backward compatibility with old clients
    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
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
    const { userId } = await this.authService.verify2FASessionToken(
      dto.twoFactorSessionToken,
    );

    const isValid = await this.twoFactorAuthService.verifyToken(
      userId,
      dto.token,
    );

    if (!isValid) {
      return { success: false, message: 'Invalid 2FA token' };
    }

    // Generate final JWT token
    const user = await this.authService.findUserById(userId);
    const result = await this.authService.login(user);

    // Set HttpOnly Cookies after successful 2FA
    this.cookieService.setAuthCookies(
      res,
      result.access_token,
      result.refresh_token,
    );

    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
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
    return this.authService.register(dto);
  }

  @Public()
  @Post('redeem-invite')
  async redeemInvite(
    @Body() dto: RedeemInviteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.redeemInvite(dto);

    // Set HttpOnly Cookies for invite redemption
    this.cookieService.setAuthCookies(
      res,
      result.access_token,
      result.refresh_token,
    );

    return result;
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
    const freshUser = await this.authService.findUserById(req.user.userId);

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
    const result = await this.authService.refreshTokens(userId, refreshToken);

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
    @Request() req: { user: { userId: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user['userId'];
    await this.authService.logout(userId);

    // Clear HttpOnly Cookies on logout
    this.cookieService.clearAuthCookies(res);

    return { message: 'Logged out successfully' };
  }
}

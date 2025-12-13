import {
  Controller,
  Post,
  UseGuards,
  Request,
  Res,
  Body,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { RedeemInviteDto } from './dto/redeem-invite.dto';
// import { SafeUser } from './types/safe-user.interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { Public } from './decorators/public.decorator';
import { VerifyLogin2FADto } from './dto/two-factor-auth.dto';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private twoFactorAuthService: TwoFactorAuthService,
  ) { }

  // POST /auth/login
  @Public()
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
      return {
        ...result,
        requires2FA: true,
        message: 'Please provide your 2FA token to complete login',
      };
    }

    // Set HttpOnly Cookies
    this.setAuthCookies(res, result.access_token, result.refresh_token);

    return {
      user: result.user,
      message: 'Login successful',
    };
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    console.log(`🍪 Setting Auth Cookies (Secure: ${process.env.NODE_ENV === 'production'})`);
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Relaxed for better dev compatibility
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  // POST /auth/verify-2fa-login
  @Public()
  @Post('verify-2fa-login')
  async verify2FALogin(@Body() dto: VerifyLogin2FADto & { userId: string }) {
    const isValid = await this.twoFactorAuthService.verifyToken(
      dto.userId,
      dto.token,
    );

    if (!isValid) {
      return { success: false, message: 'Invalid 2FA token' };
    }

    // Generate final JWT token
    const user = await this.authService.findUserById(dto.userId);
    return this.authService.login(user);
  }

  // POST /auth/register
  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('redeem-invite')
  async redeemInvite(@Body() dto: RedeemInviteDto) {
    return this.authService.redeemInvite(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(
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
    if (
      req &&
      typeof req === 'object' &&
      req.user &&
      typeof req.user === 'object'
    ) {
      const user = req.user;
      return user;
    }
    return null;
  }

  @UseGuards(JwtAuthGuard)
  @Get('test-protected')
  testProtected(
    @Request() req: { user: { id: string; email: string; name: string } },
  ) {
    console.log('testProtected req.user:', req.user);
    return req.user;
  }

  @UseGuards(JwtRefreshAuthGuard)
  @Get('refresh')
  refreshTokens(
    @Request() req: { user: { userId: string; refreshToken: string } },
  ) {
    const userId = req.user['userId'];
    const refreshToken = req.user['refreshToken'];
    return this.authService.refreshTokens(userId, refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('logout')
  logout(@Request() req: { user: { userId: string } }) {
    const userId = req.user['userId'];
    return this.authService.logout(userId);
  }
}

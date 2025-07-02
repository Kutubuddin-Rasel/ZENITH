import { Controller, Post, UseGuards, Request, Body, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { RedeemInviteDto } from './dto/redeem-invite.dto';
import { SafeUser } from './types/safe-user.interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // POST /auth/login
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    // LocalStrategy attaches the validated user to req.user
    return this.authService.login(req.user);
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
  getProfile(@Request() req: any) {
    if (
      req &&
      typeof req === 'object' &&
      req.user &&
      typeof req.user === 'object'
    ) {
      const user = req.user as {
        userId: string;
        email: string;
        isSuperAdmin: boolean;
        name: string;
      };
      return user;
    }
    return null;
  }

  @UseGuards(JwtAuthGuard)
  @Get('test-protected')
  testProtected(@Request() req) {
    console.log('testProtected req.user:', req.user);
    return req.user;
  }
}

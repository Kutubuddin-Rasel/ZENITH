import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

interface JwtPayload {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  name: string;
  organizationId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const opts: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: any) => {
          const cookieToken = request?.cookies?.access_token;
          if (cookieToken) console.log('✅ JwtStrategy: Found access_token in cookies');
          else console.log('⚠️ JwtStrategy: No access_token in cookies. Cookies:', request?.cookies);
          return cookieToken;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: cfg.get<string>('JWT_SECRET')!,
    };
    super(opts);
  }

  async validate(payload: JwtPayload) {
    try {
      const user = await this.usersService.findOneById(payload.userId);
      if (!user.isActive) {
        throw new UnauthorizedException('User is inactive');
      }
    } catch {
      throw new UnauthorizedException('User no longer exists');
    }

    return {
      id: payload.userId,
      userId: payload.userId,
      email: payload.email,
      isSuperAdmin: payload.isSuperAdmin,
      name: payload.name,
      organizationId: payload.organizationId,
    };
  }
}

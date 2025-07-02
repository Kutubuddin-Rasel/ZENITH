import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

interface JwtPayload {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(cfg: ConfigService) {
    const opts: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.get<string>('JWT_SECRET')!,
    };
    super(opts);
  }

  async validate(payload: JwtPayload) {
    console.log('JwtStrategy payload:', payload);
    return {
      userId: payload.userId,
      email: payload.email,
      isSuperAdmin: payload.isSuperAdmin,
      name: payload.name,
    };
  }
}

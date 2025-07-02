// src/auth/strategies/local.strategy.ts
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    // Tell passport-local to look for an "email" field rather than "username"
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    // Should return the user object (without password) or throw UnauthorizedException
    return this.authService.validateUser(email, password);
  }
}

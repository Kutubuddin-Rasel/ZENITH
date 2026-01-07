// src/auth/strategies/local.strategy.ts
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

/**
 * LocalStrategy - Username/Password Authentication
 *
 * Handles the initial login step using email + password credentials.
 * On success, returns the validated user object.
 * On failure, throws UnauthorizedException with a generic message.
 *
 * SECURITY: Error message is intentionally vague to prevent
 * user enumeration attacks (don't reveal if email exists).
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    // Tell passport-local to look for an "email" field rather than "username"
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const user = await this.authService.validateUser(email, password);

    // SECURITY FIX: Throw explicit exception instead of returning null
    // This ensures consistent error handling and proper audit logging
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }
}

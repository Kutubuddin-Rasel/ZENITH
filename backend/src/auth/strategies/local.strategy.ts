// src/auth/strategies/local.strategy.ts
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Inject, Injectable } from '@nestjs/common';

import { AUTHENTICATOR_TOKEN } from '../constants/auth.tokens';
import {
  AuthPrincipal,
  IAuthenticator,
  LocalCredentials,
} from '../interfaces/core.interfaces';

/**
 * LocalStrategy — Passport adapter for email + password.
 *
 * Delegates 100% of validation logic to the injected
 * {@link IAuthenticator} (bound to {@link LocalCredentialAuthenticator} via
 * {@link AUTHENTICATOR_TOKEN}). The adapter is responsible only for
 * mapping Passport's positional arguments into the {@link LocalCredentials}
 * shape and surfacing the principal back to the guard.
 *
 * SECURITY: The authenticator throws `UnauthorizedException` on any
 * failure mode (bad creds, locked account, inactive user) — the generic
 * 401 prevents user-enumeration via differential error responses.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(AUTHENTICATOR_TOKEN)
    private readonly authenticator: IAuthenticator<
      LocalCredentials,
      AuthPrincipal
    >,
  ) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<AuthPrincipal> {
    return this.authenticator.authenticate({ email, password });
  }
}

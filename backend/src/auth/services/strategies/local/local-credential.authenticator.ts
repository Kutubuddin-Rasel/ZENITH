import { Injectable, UnauthorizedException } from '@nestjs/common';

import { LoginCoordinator } from '../../core/login-coordinator.service';
import {
  AuthContext,
  AuthPrincipal,
  IAuthenticator,
  LocalCredentials,
} from '../../../interfaces/core.interfaces';

/**
 * Step 4 — Local-credential authenticator. Wraps {@link LoginCoordinator}
 * with the {@link IAuthenticator} contract so the Passport `LocalStrategy`
 * adapter holds no validation logic of its own.
 *
 * Per {@link IAuthenticator}: throws `UnauthorizedException` on failure
 * (Passport guards translate that into the canonical 401 response).
 */
@Injectable()
export class LocalCredentialAuthenticator implements IAuthenticator<
  LocalCredentials,
  AuthPrincipal
> {
  constructor(private readonly loginCoordinator: LoginCoordinator) {}

  async authenticate(
    credentials: LocalCredentials,
    context?: AuthContext,
  ): Promise<AuthPrincipal> {
    const principal = await this.loginCoordinator.validateUser(
      credentials.email,
      credentials.password,
      context?.ipAddress,
    );

    if (!principal) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return principal;
  }
}

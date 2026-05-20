import { Module } from '@nestjs/common';

import { AuthCoreModule } from './auth-core.module';

import { LocalCredentialAuthenticator } from '../services/strategies/local/local-credential.authenticator';
import { LocalStrategy } from '../strategies/local.strategy';
import { LocalAuthGuard } from '../guards/local-auth.guard';

import { AUTHENTICATOR_TOKEN } from '../constants/auth.tokens';

/**
 * Step 5 — Local-credential sub-module.
 *
 * Houses the email/password authentication flow:
 *   - {@link LocalCredentialAuthenticator} (IAuthenticator implementation)
 *   - Passport's {@link LocalStrategy} adapter
 *   - {@link LocalAuthGuard} bound to the `LOCAL_GUARD` token
 *
 * Depends on {@link AuthCoreModule} solely for `LoginCoordinator` and the
 * PassportModule registration.
 */
@Module({
  imports: [AuthCoreModule],
  providers: [
    LocalCredentialAuthenticator,
    { provide: AUTHENTICATOR_TOKEN, useExisting: LocalCredentialAuthenticator },
    LocalStrategy,
    LocalAuthGuard,
    { provide: 'LOCAL_GUARD', useClass: LocalAuthGuard },
  ],
  exports: [AUTHENTICATOR_TOKEN],
})
export class LocalAuthModule {}

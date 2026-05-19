import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';

// Step 5 — Five focused domain sub-modules; the aggregator owns nothing
// but the cross-cutting `AuthController` and the public export contract.
import { AuthCoreModule } from './modules/auth-core.module';
import { LocalAuthModule } from './modules/local-auth.module';
import { SamlAuthModule } from './modules/saml-auth.module';
import { TwoFactorAuthModule } from './modules/two-factor-auth.module';
import { SessionsModule } from './modules/sessions.module';

// Guards re-exported as part of the auth public surface.
import { ProjectRoleGuard } from './guards/project-role.guard';
import { StatelessCsrfGuard } from './guards/csrf.guard';

// Token re-exports — the canonical contract the rest of the app depends on.
import {
  ACCOUNT_LOCKOUT_POLICY_TOKEN,
  AUTHENTICATOR_TOKEN,
  SAML_CONFIG_READER_TOKEN,
  SAML_CONFIG_WRITER_TOKEN,
  SAML_IDENTITY_PROVISIONER_TOKEN,
  SAML_STRATEGY_FACTORY_TOKEN,
  TOKEN_ISSUER_TOKEN,
  TOKEN_REVOKER_TOKEN,
  TOKEN_VERIFIER_TOKEN,
  TWO_FACTOR_ADMIN_SERVICE_TOKEN,
  TWO_FACTOR_BACKUP_CODE_SERVICE_TOKEN,
  TWO_FACTOR_RECOVERY_SERVICE_TOKEN,
  TWO_FACTOR_SECRET_STORE_TOKEN,
  TWO_FACTOR_VERIFIER_TOKEN,
} from './constants/auth.tokens';

/**
 * Step 5 — Aggregator `AuthModule`.
 *
 * Composes the five focused sub-modules into a single bounded context.
 * The aggregator itself holds **no providers** beyond the cross-cutting
 * `AuthController`; every concrete service lives inside its owning
 * sub-module.
 *
 * EXPORT LOCKDOWN: this surface MUST stay limited to ISP tokens and the
 * two re-usable guards. Concrete classes (TokenService, LoginCoordinator,
 * SAMLAuthenticator, etc.) are sealed behind the sub-module boundary —
 * external modules consume the interfaces via the tokens.
 */
@Module({
  imports: [
    AuthCoreModule,
    LocalAuthModule,
    SamlAuthModule,
    TwoFactorAuthModule,
    SessionsModule,
  ],
  controllers: [AuthController],
  exports: [
    // ── Core ────────────────────────────────────────────────────────
    ACCOUNT_LOCKOUT_POLICY_TOKEN,
    TOKEN_ISSUER_TOKEN,
    TOKEN_VERIFIER_TOKEN,
    TOKEN_REVOKER_TOKEN,
    // ── Local strategy ──────────────────────────────────────────────
    AUTHENTICATOR_TOKEN,
    // ── SAML ────────────────────────────────────────────────────────
    SAML_CONFIG_READER_TOKEN,
    SAML_CONFIG_WRITER_TOKEN,
    SAML_IDENTITY_PROVISIONER_TOKEN,
    SAML_STRATEGY_FACTORY_TOKEN,
    // ── Two-Factor ──────────────────────────────────────────────────
    TWO_FACTOR_SECRET_STORE_TOKEN,
    TWO_FACTOR_VERIFIER_TOKEN,
    TWO_FACTOR_BACKUP_CODE_SERVICE_TOKEN,
    TWO_FACTOR_RECOVERY_SERVICE_TOKEN,
    TWO_FACTOR_ADMIN_SERVICE_TOKEN,
    // ── Guards (re-usable auth surface). ────────────────────────────
    ProjectRoleGuard,
    StatelessCsrfGuard,
  ],
})
export class AuthModule {}

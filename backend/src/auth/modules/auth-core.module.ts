import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../../users/entities/user.entity';

import { UsersModule } from '../../users/users.module';
import { NotificationPreferencesModule } from '../../users/notification-preferences.module';
import { OrganizationsModule } from '../../organizations/organizations.module';
import { OnboardingModule } from '../../onboarding/onboarding.module';
import { AuditModule } from '../../audit/audit.module';
import { CacheModule } from '../../cache/cache.module';
import { InvitesModule } from '../../invites/invites.module';

import { SessionsModule } from './sessions.module';

// Core dismantled-AuthService replacements.
import { AccountLockoutService } from '../services/core/account-lockout.service';
import { LoginCoordinator } from '../services/core/login-coordinator.service';
import { RegistrationService } from '../services/core/registration.service';
import { TokenService } from '../services/tokens/token.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { CookieService } from '../services/cookie.service';
import { PasswordService } from '../services/password.service';
import { PasswordPolicyService } from '../services/password-policy.service';
import { PasswordBreachService } from '../services/password-breach.service';

// User-account orchestration (auth-owned slice).
import { UserPasswordService } from '../services/users/user-password.service';
import { UserLifecycleService } from '../services/users/user-lifecycle.service';
import { UserPasswordController } from '../controllers/user-password.controller';
import { UserSecurityController } from '../controllers/user-security.controller';

// JWT-side Passport strategies.
import { JwtStrategy } from '../strategies/jwt.strategy';
import { JwtRefreshStrategy } from '../strategies/jwt-refresh.strategy';

// Cross-cutting auth guards consumed by external controllers.
import { ProjectRoleGuard } from '../guards/project-role.guard';
import { StatelessCsrfGuard } from '../guards/csrf.guard';

// DIP: cross-domain user adapter binding.
import { AuthUserRepository } from '../repositories/abstract/auth-user.repository.abstract';
import { PostgresAuthUserRepository } from '../repositories/concrete/postgres-auth-user.repository';

import {
  ACCOUNT_LOCKOUT_POLICY_TOKEN,
  TOKEN_ISSUER_TOKEN,
  TOKEN_REVOKER_TOKEN,
  TOKEN_VERIFIER_TOKEN,
} from '../constants/auth.tokens';

/**
 * Step 5 — Auth-core sub-module.
 *
 * Aggregates the post-Step-3 SOLID replacements for the demolished
 * `AuthService` god-class plus the JWT pipeline, password infrastructure,
 * user-account lifecycle, and the cross-cutting auth guards.
 *
 * Token bindings here (`TOKEN_*`, `ACCOUNT_LOCKOUT_POLICY_TOKEN`) are the
 * only public contract surface — concrete classes ride along as exports
 * solely so the aggregator `AuthController` and the strategy sub-modules
 * can wire them up internally.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    EventEmitterModule.forRoot(),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET')!,
        signOptions: { expiresIn: '1h' },
      }),
    }),
    UsersModule,
    NotificationPreferencesModule,
    OrganizationsModule,
    OnboardingModule,
    AuditModule,
    CacheModule,
    InvitesModule,
    SessionsModule,
  ],
  providers: [
    AccountLockoutService,
    {
      provide: ACCOUNT_LOCKOUT_POLICY_TOKEN,
      useExisting: AccountLockoutService,
    },
    TokenService,
    { provide: TOKEN_ISSUER_TOKEN, useExisting: TokenService },
    { provide: TOKEN_VERIFIER_TOKEN, useExisting: TokenService },
    { provide: TOKEN_REVOKER_TOKEN, useExisting: TokenService },
    TokenBlacklistService,
    RegistrationService,
    LoginCoordinator,
    CookieService,
    PasswordService,
    PasswordPolicyService,
    PasswordBreachService,
    UserPasswordService,
    UserLifecycleService,
    JwtStrategy,
    JwtRefreshStrategy,
    ProjectRoleGuard,
    StatelessCsrfGuard,
    { provide: AuthUserRepository, useClass: PostgresAuthUserRepository },
  ],
  controllers: [UserPasswordController, UserSecurityController],
  exports: [
    // ── Tokens (the canonical public surface).
    ACCOUNT_LOCKOUT_POLICY_TOKEN,
    TOKEN_ISSUER_TOKEN,
    TOKEN_VERIFIER_TOKEN,
    TOKEN_REVOKER_TOKEN,
    // ── Concrete services consumed by the aggregator AuthController
    //     and the strategy sub-modules (intra-auth wiring only).
    AccountLockoutService,
    LoginCoordinator,
    RegistrationService,
    TokenService,
    CookieService,
    PasswordPolicyService,
    PasswordBreachService,
    AuthUserRepository,
    // ── Guards (kept exported — they are part of the auth public surface).
    ProjectRoleGuard,
    StatelessCsrfGuard,
    // ── Re-exports so sub-modules and the aggregator don't reimport.
    PassportModule,
    JwtModule,
  ],
})
export class AuthCoreModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
import { TwoFactorAuthController } from './controllers/two-factor-auth.controller';
import { SAMLService } from './services/saml.service';
import { SAMLController } from './controllers/saml.controller';
import { CookieService } from './services/cookie.service';
import { PasswordService } from './services/password.service';

// **Guards** and **Strategies**
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtCookieStrategy } from './strategies/jwt-cookie.strategy';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { ProjectRoleGuard } from './guards/project-role.guard';

// **Entities**
import { TwoFactorAuth } from './entities/two-factor-auth.entity';
import { SAMLConfig } from './entities/saml-config.entity';
import { User } from '../users/entities/user.entity';

import { UsersModule } from '../users/users.module';
// REFACTORED: InvitesModule no longer needs forwardRef - cycle is broken
import { InvitesModule } from '../invites/invites.module';
// REMOVED: MembershipModule import - using ProjectCoreModule (global) for ProjectMembersService
import { CacheModule } from '../cache/cache.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TwoFactorAuth, SAMLConfig, User]),
    UsersModule,
    OrganizationsModule,
    OnboardingModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET')!,
        signOptions: { expiresIn: '1h' },
      }),
    }),
    // REFACTORED: No more forwardRef - InvitesModule cycle is broken via core modules
    InvitesModule,
    // REFACTORED: Removed MembershipModule - ProjectCoreModule is global
    CacheModule,
  ],
  providers: [
    AuthService,
    TwoFactorAuthService,
    SAMLService,
    CookieService,
    PasswordService,
    LocalStrategy,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtCookieStrategy,
    ProjectRoleGuard,
    { provide: 'LOCAL_GUARD', useClass: LocalAuthGuard },
  ],
  controllers: [AuthController, TwoFactorAuthController, SAMLController],
  exports: [
    AuthService,
    TwoFactorAuthService,
    SAMLService,
    CookieService,
    ProjectRoleGuard,
  ],
})
export class AuthModule {}

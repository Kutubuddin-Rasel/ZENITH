// src/auth/auth.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

// **Guards** and **Strategies**
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalAuthGuard } from './guards/local-auth.guard';

import { UsersModule } from '../users/users.module';
import { InvitesModule } from '../invites/invites.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        // The non-null assertion (!) tells TypeScript you know this won't be undefined
        secret: cfg.get<string>('JWT_SECRET')!,
        signOptions: { expiresIn: '1h' },
      }),
    }),

    forwardRef(() => InvitesModule), // wrap in forwardRef
    MembershipModule, // if AuthService also injects ProjectMembersService
  ],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    // If you need to override the default 'local' or 'jwt' guards, provide them here:
    { provide: 'LOCAL_GUARD', useClass: LocalAuthGuard },
  ],
  controllers: [AuthController],
})
export class AuthModule {}

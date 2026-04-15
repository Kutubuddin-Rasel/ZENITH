import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserSecuritySettingsService } from './user-security-settings.service';
import { LoginHistoryService } from './login-history.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { UserSecuritySettings } from './entities/user-security-settings.entity';
import { LoginHistory } from './entities/login-history.entity';
import { MembershipModule } from '../membership/membership.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSecuritySettings, LoginHistory]),
    MembershipModule,
    forwardRef(() => AuthModule), // For SessionsService access (circular dependency)
  ],
  providers: [UsersService, UserSecuritySettingsService, LoginHistoryService],
  controllers: [UsersController],
  exports: [UsersService, UserSecuritySettingsService, LoginHistoryService],
})
export class UsersModule {}


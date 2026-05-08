import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserSecuritySettingsService } from './user-security-settings.service';
import { LoginHistoryService } from './login-history.service';
import { UsersController } from './users.controller';
import { UserSecuritySettings } from './entities/user-security-settings.entity';
import { LoginHistory } from './entities/login-history.entity';
import { MembershipModule } from '../membership/membership.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    // SOLID Refactor (Step 3): User is now exposed via @Global DatabaseModule.
    TypeOrmModule.forFeature([UserSecuritySettings, LoginHistory]),
    MembershipModule,
    forwardRef(() => AuthModule), // For SessionsService access (circular dependency)
  ],
  providers: [UsersService, UserSecuritySettingsService, LoginHistoryService],
  controllers: [UsersController],
  exports: [UsersService, UserSecuritySettingsService, LoginHistoryService],
})
export class UsersModule {}

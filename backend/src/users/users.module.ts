import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserSecuritySettingsService } from './user-security-settings.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { UserSecuritySettings } from './entities/user-security-settings.entity';
import { MembershipModule } from '../membership/membership.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSecuritySettings]),
    MembershipModule,
    forwardRef(() => AuthModule), // For SessionsService access (circular dependency)
  ],
  providers: [UsersService, UserSecuritySettingsService],
  controllers: [UsersController],
  exports: [UsersService, UserSecuritySettingsService],
})
export class UsersModule {}

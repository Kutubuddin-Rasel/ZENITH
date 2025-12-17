import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';

/**
 * UsersCoreModule
 *
 * Provides UsersService globally for user lookup across all modules.
 * This eliminates forwardRef cycles where modules need to look up users.
 *
 * Common use cases:
 * - IssuesService for assignee lookup
 * - NotificationsModule for user preferences
 * - SprintsService for user info
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersCoreModule {}

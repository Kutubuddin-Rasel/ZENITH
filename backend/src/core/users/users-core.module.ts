import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';

// SOLID Refactor (issues Step 2b): capability-owner side of the issues →
// users inversion. The `UserLookupPort` contract is declared in
// `issues/ports/user-lookup.port.ts` (consumer-owned); binding the adapter
// here gives the port the same @Global reach `UsersService` already has, so
// `issues.module` needs no new import.
import { UserLookupPort } from '../../issues';
import { UserLookupAdapter } from '../../users/adapters/user-lookup.adapter';

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
  providers: [
    UsersService,
    { provide: UserLookupPort, useClass: UserLookupAdapter },
  ],
  exports: [UsersService, UserLookupPort],
})
export class UsersCoreModule {}

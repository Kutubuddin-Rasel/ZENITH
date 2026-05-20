import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import {
  USER_EMAIL_VERIFIER,
  USER_LIFECYCLE_MANAGER,
  USER_PROFILE_READER,
  USER_PROFILE_WRITER,
} from './constants/user.tokens';

/**
 * UsersModule — the final shape after Steps 1–6.
 *
 * Step 3 (Auth-Concern Extraction): no `forwardRef(() => AuthModule)`; auth
 * collaborates via domain events.
 *
 * Step 4 (Sibling Service Relocation): `LoginHistoryService` and the session
 * half of `UserSecuritySettingsService` moved to auth.
 *
 * Step 5 (Repository DIP Hardening): all `@InjectRepository` use has moved
 * to concrete `Postgres*Repository` adapters.
 *
 * Step 6 (Module Lockdown): the public surface is now exclusively the four
 * segregated ISP tokens defined in `constants/user.tokens.ts`. The concrete
 * `UsersService` is provided internally and bound to each token via
 * `useExisting`, but is no longer exported. Avatar uploads, project-
 * membership reads, and notification preferences have all moved to their
 * own modules (`StorageModule`, `MembershipModule`, `NotificationPreferences
 * Module`), so the historic `MembershipModule` import has been removed.
 */
@Module({
  imports: [
    // User is exposed via @Global DatabaseModule (Step 1).
    EventEmitterModule.forRoot(),
  ],
  providers: [
    // Internal concrete implementation — NOT exported.
    UsersService,
    // Step 6 — bind every ISP token to the single UsersService instance so
    // downstream consumers depend only on the narrow contract they need.
    { provide: USER_PROFILE_READER, useExisting: UsersService },
    { provide: USER_PROFILE_WRITER, useExisting: UsersService },
    { provide: USER_LIFECYCLE_MANAGER, useExisting: UsersService },
    { provide: USER_EMAIL_VERIFIER, useExisting: UsersService },
  ],
  controllers: [UsersController],
  // STRICT (Step 6): exports = the four segregated ISP tokens only.
  exports: [
    USER_PROFILE_READER,
    USER_PROFILE_WRITER,
    USER_LIFECYCLE_MANAGER,
    USER_EMAIL_VERIFIER,
  ],
})
export class UsersModule {}

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { UserRepository } from '../../../database/repositories/user.repository';
import { SessionsService } from '../../sessions.service';
import {
  USER_DELETED_EVENT,
  UserDeletedEvent,
} from '../../../core/events/payloads/user-deleted.event';

/**
 * Auth-domain owner of the post-delete secret lifecycle.
 *
 * Listens for `USER_DELETED_EVENT` emitted by `UsersService.deleteAccount`
 * and performs the auth-only follow-up that the users module is no longer
 * permitted to do:
 *
 *   - Wipe `passwordHash` (empty string — the column is NOT NULL).
 *   - Null out `hashedRefreshToken`.
 *   - Null out the email-verification token + expiry, reset `emailVerified`.
 *   - Revoke every active session (BullMQ-free, runs inline).
 *
 * Failure is non-fatal: the user-side anonymisation has already committed, so
 * we log and swallow rather than re-raising. A future hardening prompt can
 * route persistent failures into a dead-letter queue.
 */
@Injectable()
export class UserLifecycleService {
  private readonly logger = new Logger(UserLifecycleService.name);

  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionsService: SessionsService,
  ) {}

  @OnEvent(USER_DELETED_EVENT, { async: true })
  async onUserDeleted(event: UserDeletedEvent): Promise<void> {
    try {
      const user = await this.userRepo.findById(event.userId);
      if (!user) {
        this.logger.warn(
          `UserDeletedEvent: user ${event.userId} not found — skipping secret scrub`,
        );
        return;
      }

      user.passwordHash = '';
      user.hashedRefreshToken = null;
      user.emailVerified = false;
      user.emailVerificationToken = null;
      user.emailVerificationExpiry = null;
      await this.userRepo.save(user);

      const revoked = await this.sessionsService.revokeAllSessions(
        event.userId,
      );

      this.logger.log(
        `Secrets scrubbed and ${revoked} session(s) revoked for deleted user ${event.userId}`,
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to scrub secrets for deleted user ${event.userId}: ${errMsg}`,
      );
    }
  }
}

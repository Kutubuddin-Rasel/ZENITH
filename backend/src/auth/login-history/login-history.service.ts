import { Injectable, Logger } from '@nestjs/common';

import {
  LoginHistoryEntry,
  LoginHistoryRepository,
  NewLoginAttempt,
} from '../repositories/abstract/login-history.repository.abstract';
import { LoginFailureReason } from './entities/login-history.entity';

/**
 * Step 4 — Login-history observability moved out of `UsersModule` into the
 * auth subsystem, where the recording side-effect already belongs.
 *
 * Step 5 — Depends on the abstract `LoginHistoryRepository`. The fire-and-
 * forget guarantee (never break a login flow because we couldn't record
 * observability data) is enforced here in the service; the repository is
 * free to throw on infrastructure failure.
 */
export type RecordLoginAttemptParams = NewLoginAttempt;

export type { LoginFailureReason, LoginHistoryEntry };

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 100;

@Injectable()
export class LoginHistoryService {
  private readonly logger = new Logger(LoginHistoryService.name);

  constructor(
    private readonly loginHistoryRepository: LoginHistoryRepository,
  ) {}

  /**
   * Record a login attempt. Errors are swallowed and logged — the caller's
   * login flow must NEVER fail because we couldn't write observability data.
   */
  async recordAttempt(params: RecordLoginAttemptParams): Promise<void> {
    try {
      await this.loginHistoryRepository.insertAttempt(params);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to record login attempt for user ${params.userId}: ${errMsg}`,
      );
    }
  }

  async getHistory(
    userId: string,
    limit: number = DEFAULT_HISTORY_LIMIT,
  ): Promise<ReadonlyArray<LoginHistoryEntry>> {
    const clampedLimit = Math.min(Math.max(1, limit), MAX_HISTORY_LIMIT);
    return this.loginHistoryRepository.findRecentForUser(userId, clampedLimit);
  }
}

import { LoginFailureReason } from '../../login-history/entities/login-history.entity';

/**
 * Insert-side payload — exactly the columns we record per attempt.
 * Identical shape to `RecordLoginAttemptParams` on the service, duplicated
 * here so the abstract has no upstream dependency on the service file.
 */
export interface NewLoginAttempt {
  readonly userId: string;
  readonly ipAddress: string;
  readonly userAgent: string | null;
  readonly deviceFingerprint: string | null;
  readonly success: boolean;
  readonly failureReason: LoginFailureReason | null;
  readonly organizationId: string | null;
}

/**
 * Read-side projection — frontend-safe shape returned by `findRecentForUser`.
 * Excludes internal columns (`id`, `userId`, `organizationId`).
 */
export interface LoginHistoryEntry {
  readonly ipAddress: string;
  readonly userAgent: string | null;
  readonly deviceFingerprint: string | null;
  readonly timestamp: Date;
  readonly success: boolean;
  readonly failureReason: LoginFailureReason | null;
}

/**
 * Step 5 — DIP injection token for the append-only login-attempt log.
 * Concrete TypeORM implementation lives in
 * `auth/repositories/concrete/postgres-login-history.repository.ts`.
 *
 * The repository emits errors on failure; the fire-and-forget semantic
 * (never break the login flow because we couldn't record observability data)
 * is enforced one layer up in `LoginHistoryService.recordAttempt`.
 */
export abstract class LoginHistoryRepository {
  /** Append a single login-attempt row. May throw on database failure. */
  abstract insertAttempt(attempt: NewLoginAttempt): Promise<void>;

  /**
   * Paginated history for a user, ordered by timestamp DESC. The result is
   * already projected to the frontend-safe shape — callers do not need to map.
   */
  abstract findRecentForUser(
    userId: string,
    limit: number,
  ): Promise<ReadonlyArray<LoginHistoryEntry>>;
}

import { UserSession } from '../../entities/user-session.entity';

/**
 * Step 2 — DIP injection token for the user-session store. Concrete TypeORM
 * implementation lives in
 * `auth/repositories/concrete/postgres-user-session.repository.ts`.
 *
 * All delete verbs return the number of rows affected so the service layer
 * can preserve its boolean / count contracts without touching TypeORM
 * `DeleteResult` types.
 */
export abstract class UserSessionRepository {
  /**
   * Factory — returns an unsaved entity instance seeded with `partial`.
   * No I/O. Callers must `save` to persist.
   */
  abstract create(seed: Partial<UserSession>): UserSession;

  /** Persist (insert or update) the supplied entity. */
  abstract save(session: UserSession): Promise<UserSession>;

  /** Update `lastUsedAt` on the row matching `tokenHash`. */
  abstract touchByTokenHash(tokenHash: string, lastUsedAt: Date): Promise<void>;

  /** Lookup the session matching the supplied token hash. */
  abstract findByTokenHash(tokenHash: string): Promise<UserSession | null>;

  /**
   * List sessions for a user with device / network metadata, ordered by
   * most-recently-used. Preserves the legacy projection — `expiresAt` is
   * intentionally excluded.
   */
  abstract listForUserWithDeviceInfo(userId: string): Promise<UserSession[]>;

  /** Delete one session belonging to a user; returns rows affected. */
  abstract deleteByIdForUser(
    sessionId: string,
    userId: string,
  ): Promise<number>;

  /** Delete every session for a user except the supplied id. */
  abstract deleteAllForUserExcept(
    userId: string,
    exceptId: string,
  ): Promise<number>;

  /** Delete every session for a user (logout everywhere). */
  abstract deleteAllForUser(userId: string): Promise<number>;

  /** Delete every session whose `expiresAt` is strictly before `cutoff`. */
  abstract deleteExpiredBefore(cutoff: Date): Promise<number>;

  /** Total sessions for the supplied user. */
  abstract countForUser(userId: string): Promise<number>;
}

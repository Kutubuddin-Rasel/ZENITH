import { SessionPolicy } from '../../entities/session-policy.entity';

/**
 * Default-value seed used by `getOrCreate` when no row exists yet for the
 * user. The repository fills in `id`, `userId`, `createdAt`, `updatedAt`.
 */
export interface SessionPolicyDefaults {
  readonly sessionTimeoutMinutes: number;
  readonly maxConcurrentSessions: number;
  readonly killOldestOnLimit: boolean;
}

/**
 * Step 5 — DIP injection token for the session-policy half of the legacy
 * `user_security_settings` row. Concrete TypeORM implementation lives in
 * `auth/repositories/concrete/postgres-session-preferences.repository.ts`.
 *
 * The abstract owns the unique-violation race semantics so that the service
 * never has to import TypeORM error types.
 */
export abstract class SessionPreferencesRepository {
  /** Lookup by user id. Resolves to `null` when no row exists. */
  abstract findByUserId(userId: string): Promise<SessionPolicy | null>;

  /**
   * Atomically returns the existing row for `userId`, or inserts one seeded
   * with `defaults`. Concurrent insert races resolve to the surviving row.
   */
  abstract getOrCreate(
    userId: string,
    defaults: SessionPolicyDefaults,
  ): Promise<SessionPolicy>;

  /** Persist mutations to an already-loaded entity. */
  abstract save(entity: SessionPolicy): Promise<SessionPolicy>;
}

import { NotificationPreference } from '../../entities/notification-preference.entity';

/**
 * Default-value seed used by `getOrCreate` when no row exists yet for the
 * user. The repository fills in `id`, `userId`, `createdAt`, `updatedAt`.
 */
export interface NotificationPreferenceDefaults {
  readonly notifyOnNewLogin: boolean;
  readonly notifyOnPasswordChange: boolean;
  readonly notifyOnSecurityEvent: boolean;
}

/**
 * Step 5 — DIP injection token for the notification-preference half of the
 * legacy `user_security_settings` row. Concrete TypeORM implementation lives
 * in `users/repositories/concrete/postgres-notification-preferences.repository.ts`.
 *
 * The abstract owns the unique-violation race semantics so that the service
 * never has to import TypeORM error types.
 */
export abstract class NotificationPreferencesRepository {
  /** Lookup by user id. Resolves to `null` when no row exists. */
  abstract findByUserId(userId: string): Promise<NotificationPreference | null>;

  /**
   * Atomically returns the existing row for `userId`, or inserts one seeded
   * with `defaults`. If a concurrent writer wins the insert race, the
   * resulting row is returned (no exception bubbles up).
   */
  abstract getOrCreate(
    userId: string,
    defaults: NotificationPreferenceDefaults,
  ): Promise<NotificationPreference>;

  /** Persist mutations to an already-loaded entity. */
  abstract save(
    entity: NotificationPreference,
  ): Promise<NotificationPreference>;
}

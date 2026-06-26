/**
 * Domain event emitted by `UserPasswordService` after a successful password
 * rotation. It allows downstream listeners (notifications, telemetry, threat
 * monitoring) to react without coupling back into the auth module.
 *
 * The session revocation that pairs with a password change is performed
 * synchronously inside `UserPasswordService` — this event is observational and
 * MUST NOT be relied on to invalidate active credentials.
 */

/** Wire-format event name. */
export const PASSWORD_CHANGED_EVENT = 'user.password-changed' as const;

/** Compile-time alias for the event name literal. */
export type PasswordChangedEventName = typeof PASSWORD_CHANGED_EVENT;

/**
 * Payload emitted alongside `PASSWORD_CHANGED_EVENT`.
 */
export interface PasswordChangedEvent {
  /** UUID of the user whose password was rotated. */
  readonly userId: string;
  /** Monotonic password version after the rotation (used for JWT invalidation). */
  readonly newPasswordVersion: number;
  /** Count of sessions revoked synchronously by `UserPasswordService`. */
  readonly revokedSessions: number;
  /** Session id preserved across rotation, or `null` if all sessions were revoked. */
  readonly preservedCurrentSessionId: string | null;
  /** Wall-clock timestamp at which the rotation was committed. */
  readonly changedAt: Date;
  /** Correlated request id from CLS, or `null` if no request context was present. */
  readonly requestId: string | null;
}

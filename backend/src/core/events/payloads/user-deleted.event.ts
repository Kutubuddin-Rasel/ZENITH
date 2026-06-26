/**
 * Domain event emitted by `UsersService.deleteAccount` after the user-facing
 * PII anonymisation step has succeeded.
 *
 * The payload carries everything an auth-side listener needs to perform the
 * follow-up secret scrub (password hash, refresh-token hash, verification
 * token) and revoke active sessions — without the `users` module ever needing
 * to know that any of those concerns exist.
 *
 * Listeners (auth domain):
 *   - `UserLifecycleService.onUserDeleted` → wipes secrets, revokes sessions.
 */

/** Wire-format event name. Frozen at the const level for type-safe `@OnEvent()`. */
export const USER_DELETED_EVENT = 'user.deleted' as const;

/** Compile-time alias for the event name literal. */
export type UserDeletedEventName = typeof USER_DELETED_EVENT;

/**
 * Payload emitted alongside `USER_DELETED_EVENT`.
 *
 * All fields are `readonly` — listeners must not mutate the payload (it is
 * delivered synchronously and shared across every subscriber).
 */
export interface UserDeletedEvent {
  /** UUID of the user whose account was deleted. */
  readonly userId: string;
  /** Pre-anonymisation email — preserved for audit-trail forensics only. */
  readonly originalEmail: string;
  /** Pre-anonymisation display name — preserved for audit-trail forensics only. */
  readonly originalName: string;
  /** Owning organisation, or `null` for unaffiliated users. */
  readonly organizationId: string | null;
  /** Correlated request id from CLS, or `null` for system-driven deletes. */
  readonly requestId: string | null;
  /** Wall-clock timestamp at which the domain delete was committed. */
  readonly deletedAt: Date;
}

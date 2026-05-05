/**
 * Invite Status Enum
 *
 * Defines all valid states in the Invite state machine.
 * Values use PascalCase to match existing database records
 * (avoids a data migration from the prior string-literal approach).
 *
 * State Transitions:
 *   Pending  → Accepted  (invitee accepts)
 *   Pending  → Rejected  (invitee rejects)
 *   Pending  → Revoked   (inviter revokes)
 *   Pending  → Expired   (system detects expiration on access)
 */
export enum InviteStatus {
  Pending = 'Pending',
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  Revoked = 'Revoked',
  Expired = 'Expired',
}

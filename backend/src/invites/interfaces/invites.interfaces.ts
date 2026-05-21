/**
 * Invites Module — Abstract Contracts (ISP Surface)
 *
 * These interfaces are the ONLY allowed coupling point between the
 * invites module and the rest of Zenith. Concrete services,
 * repositories, and the persistence entity `Invite` are
 * implementation details that must never leak across the module
 * boundary.
 *
 * DTO Strategy
 * ------------
 * `InviteSummary`, `InviteWithRelations`, and the command DTOs are
 * pure value-object views — they intentionally do NOT extend the
 * TypeORM `Invite` entity so consumers cannot accidentally depend on
 * ORM metadata, lifecycle decorators, lazy relations, or the
 * cross-aggregate `User` reference embedded in `Invite.invitee` /
 * `Invite.inviter`.
 *
 * Segregation Rationale (ISP)
 * ---------------------------
 *  - Query / Command split keeps read-heavy consumers (registration
 *    flow, project dashboards) decoupled from mutating capabilities
 *    (invites controller, bulk-invite admin flow).
 *  - `IInvitePolicy` isolates the actor-ownership / expiration /
 *    state-machine rules so they can be unit-tested without the DB
 *    or the event bus, mirroring how `IProjectMemberPolicy` isolates
 *    role-hierarchy enforcement in the membership module.
 *  - `IInviteTokenGenerator` is a single-method seam that exists so
 *    deterministic tests can replace the CSPRNG without monkey-
 *    patching `crypto.randomBytes`.
 *
 * The repository contract `AbstractInviteRepository` (Step 2) lives
 * in `repositories/abstract/` — it is a module-internal DIP boundary
 * and is intentionally NOT re-exported through this barrel.
 */

import { InviteStatus } from '../enums/invite-status.enum';

// ---------------------------------------------------------------------------
// Value-Object Views (DTOs) — zero TypeORM coupling
// ---------------------------------------------------------------------------

/**
 * Minimal projection of an invites row. Used by every read path that
 * does not need the joined invitee/inviter user records.
 *
 * Note `inviteeId` is nullable to support the "shadow account" flow
 * where an invite is issued by email for a user that does not yet
 * exist in `users`. In that case `inviteeEmail` is populated instead.
 */
export interface InviteSummary {
  readonly id: string;
  readonly token: string;
  readonly projectId: string;
  readonly inviteeId: string | null;
  readonly inviteeEmail: string | null;
  readonly inviterId: string;
  readonly role: string;
  readonly status: InviteStatus;
  readonly expiresAt: Date | null;
  readonly respondedAt: Date | null;
  readonly reason: string | null;
  readonly createdAt: Date;
}

/**
 * Lightweight user projection used inside `InviteWithRelations`.
 * Mirrors the field set the notifications listener and the invites UI
 * actually consume — sensitive auth fields (password hash, refresh
 * tokens, MFA secrets) are intentionally absent.
 */
export interface InviteUserRef {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

/**
 * Projection used by read paths that need to render or notify the
 * invitee/inviter (e.g., the project members admin screen and the
 * notifications listener). `invitee` is nullable to handle the
 * shadow-account case where the invite was issued by email to a user
 * that does not yet exist.
 */
export interface InviteWithRelations extends InviteSummary {
  readonly invitee: InviteUserRef | null;
  readonly inviter: InviteUserRef;
}

// ---------------------------------------------------------------------------
// Command DTOs (input contracts for the write-side surface)
// ---------------------------------------------------------------------------

/**
 * Input contract for `IInviteCommand.createInvite`. Exactly one of
 * `inviteeId` or `email` MUST be supplied — the command service
 * validates this at runtime and throws `BadRequestException` if both
 * or neither are provided.
 */
export interface InviteCreateCommand {
  readonly projectId: string;
  readonly inviterId: string;
  readonly role: string;
  readonly inviteeId?: string;
  readonly email?: string;
  readonly expiresInHours?: number;
}

/**
 * Input contract for `IInviteCommand.respondToInvite`. `accept=false`
 * with a populated `reason` is the explicit rejection path; the
 * command service uses `reason` to drive the `invite.responded`
 * notification copy.
 */
export interface InviteResponseCommand {
  readonly inviteId: string;
  readonly userId: string;
  readonly accept: boolean;
  readonly reason?: string;
}

/**
 * Single entry inside a bulk-invite request. `inviteeId` and `email`
 * follow the same XOR semantics as `InviteCreateCommand`.
 */
export interface BulkInviteEntry {
  readonly role: string;
  readonly inviteeId?: string;
  readonly email?: string;
  readonly expiresInHours?: number;
}

/**
 * Input contract for `IInviteCommand.bulkInvite`. The bulk-invite
 * flow is transactional at the repository layer; failures inside the
 * transaction collapse to `BulkInviteResult.failed[]` rather than
 * propagating as exceptions, so the caller can render a per-row
 * report. Aggregate failures (transaction abort) still throw.
 */
export interface BulkInviteCommand {
  readonly projectId: string;
  readonly inviterId: string;
  readonly entries: readonly BulkInviteEntry[];
}

/**
 * Partial-success shape returned by `IInviteCommand.bulkInvite`.
 * Matches the legacy `InvitesService.bulkInvite` return contract so
 * the admin UI stays binary-compatible across the refactor.
 */
export interface BulkInviteResult {
  readonly created: readonly InviteSummary[];
  readonly failed: ReadonlyArray<{
    readonly index: number;
    readonly reason: string;
  }>;
}

// ---------------------------------------------------------------------------
// Read Surface — Pure queries, no audit, no events, no policy checks
// ---------------------------------------------------------------------------

export interface IInviteQuery {
  /**
   * Resolve an invite by its public token (used by the
   * `/auth/redeem-invite` flow). Returns `null` if the token is
   * unknown — callers must translate to `NotFoundException` if
   * appropriate.
   */
  findOneByToken(token: string): Promise<InviteWithRelations | null>;

  /**
   * List every invite issued for a project, including the joined
   * invitee + inviter user references. Ordered newest-first.
   */
  findForProject(projectId: string): Promise<readonly InviteWithRelations[]>;

  /**
   * Return the most recent pending invite for `(projectId,
   * inviteeId)` if one exists. Used by the duplicate-guard inside
   * `IInviteCommand.createInvite`.
   */
  findActivePendingByUser(
    projectId: string,
    inviteeId: string,
  ): Promise<InviteSummary | null>;

  /**
   * Return the most recent pending invite for `(projectId,
   * inviteeEmail)` if one exists. Used by the duplicate-guard for
   * shadow-account invites.
   */
  findActivePendingByEmail(
    projectId: string,
    inviteeEmail: string,
  ): Promise<InviteSummary | null>;
}

// ---------------------------------------------------------------------------
// Write Surface — Mutations with policy checks + event emission
// ---------------------------------------------------------------------------

/**
 * Every mutation MUST:
 *   1. Enforce ownership / state-machine / expiration rules via
 *      `IInvitePolicy` BEFORE mutating any persistence state.
 *   2. Persist the mutation through `AbstractInviteRepository` — never
 *      against a raw TypeORM repository or `DataSource`.
 *   3. Emit the corresponding `INVITES_EVENTS.*` event AFTER a
 *      successful DB write (never on failure — phantom notifications
 *      are forbidden).
 */
export interface IInviteCommand {
  /**
   * Issue a new invite. Idempotency-light: an active `Pending` invite
   * for the same `(projectId, inviteeId)` or `(projectId,
   * inviteeEmail)` triggers `BadRequestException`. Shadow-account
   * invites (email-only) are supported.
   */
  createInvite(command: InviteCreateCommand): Promise<InviteSummary>;

  /**
   * Revoke a pending invite. Only the original inviter is authorised
   * — `IInvitePolicy.assertCanRevoke` enforces this.
   */
  revokeInvite(inviteId: string, actorId: string): Promise<InviteSummary>;

  /**
   * Resend a pending invite (no state change — re-emits the
   * `invite.resend` event so the notifications module can dispatch a
   * fresh reminder).
   */
  resendInvite(inviteId: string, actorId: string): Promise<void>;

  /**
   * Apply the invitee's accept/reject decision. On accept this
   * delegates membership creation to `IProjectMemberCommand.addMember`
   * — the invites module never writes to `project_members` directly.
   */
  respondToInvite(command: InviteResponseCommand): Promise<InviteSummary>;

  /**
   * Transactional bulk issue. Partial-success: per-entry failures are
   * collected into `BulkInviteResult.failed` rather than aborting the
   * whole transaction.
   */
  bulkInvite(command: BulkInviteCommand): Promise<BulkInviteResult>;
}

// ---------------------------------------------------------------------------
// Policy Surface — Ownership, state-machine, and expiration enforcement
// ---------------------------------------------------------------------------

/**
 * Narrow check-only surface for invite policy decisions. Implementations
 * are pure functions today; the async return shape is reserved for
 * future rules that may need a DB lookup (e.g., per-project resend
 * cooldowns).
 *
 * Each `assert*` throws `ForbiddenException` (ownership) or
 * `BadRequestException` (state / expiration) with a consistent error
 * message rather than returning a boolean, so callers do not have to
 * branch on the policy result.
 */
export interface IInvitePolicy {
  /**
   * Throw if `actorId !== invite.inviterId`. Used by `revokeInvite`
   * and `resendInvite`.
   */
  assertCanRevoke(invite: InviteSummary, actorId: string): void;

  /**
   * Throw if `actorId !== invite.inviterId`. Separate method from
   * `assertCanRevoke` so future divergence (e.g., allowing project
   * admins to resend) does not require touching the revoke caller.
   */
  assertCanResend(invite: InviteSummary, actorId: string): void;

  /**
   * Throw if `actorId !== invite.inviteeId`. Used by
   * `respondToInvite` to prevent third parties from accepting/
   * rejecting someone else's invite.
   */
  assertCanRespond(invite: InviteSummary, actorId: string): void;

  /**
   * Throw if `invite.status !== Pending`. Used by every mutation
   * that requires the invite to be in the initial state.
   */
  assertPending(invite: InviteSummary): void;

  /**
   * Throw if `invite.expiresAt` is in the past. The command service
   * is responsible for flipping the persisted status to `Expired`
   * after this check throws.
   */
  assertNotExpired(invite: InviteSummary): void;
}

// ---------------------------------------------------------------------------
// Token Generator Surface — pluggable CSPRNG seam
// ---------------------------------------------------------------------------

/**
 * Single-method contract that wraps the secure random token
 * generator. Exists so deterministic tests can bind a stub
 * implementation against `INVITE_TOKEN_GENERATOR_TOKEN` instead of
 * monkey-patching `crypto.randomBytes`.
 */
export interface IInviteTokenGenerator {
  /**
   * Return a URL-safe opaque string with at least 256 bits of
   * entropy. The default implementation uses
   * `crypto.randomBytes(32).toString('hex')`.
   */
  generate(): string;
}

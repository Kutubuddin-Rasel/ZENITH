/**
 * Invite Event Payloads — Typed Contracts for Event-Driven Architecture
 *
 * These interfaces define the shape of events emitted by the invites
 * command service. Consumers (NotificationsListener,
 * ActivityFeedListener, WebhooksService, etc.) subscribe via
 * `@OnEvent(INVITES_EVENTS.CREATED)` and receive strongly-typed
 * payloads built from value-object DTOs — NEVER the TypeORM `Invite`,
 * `Project`, or `User` entities. This keeps the event bus a one-way
 * decoupling seam: a listener cannot accidentally trigger a lazy
 * relation load or write back to the database.
 *
 * EVENT NAMING CONVENTION
 *   invite.created       — A new invite was issued
 *   invite.revoked       — A pending invite was revoked by the inviter
 *   invite.resend        — The inviter requested a reminder
 *   invite.responded     — The invitee accepted or rejected the invite
 *   invite.bulk.created  — A bulk-invite request committed at least one row
 *
 * TIMING: All events are emitted AFTER the DB write succeeds. This
 * prevents phantom notifications if the write fails.
 *
 * COMPATIBILITY: The event-key strings match the legacy emission
 * sites in `invites.service.ts` (`'invite.created'`, etc.) so the
 * existing notifications listener does not require a coordinated
 * cut-over. The payload SHAPE will change in Step 3 when the
 * notifications listener migrates onto these DTO types.
 *
 * @see invite-command.service.ts (Step 3) for emission points
 */

import { InviteSummary, InviteUserRef } from '../interfaces/invites.interfaces';

// =============================================================================
// EVENT NAME CONSTANTS
// =============================================================================

/**
 * Event name constants to prevent typos in emitter/subscriber
 * coupling. Use these instead of raw strings.
 */
export const INVITES_EVENTS = {
  CREATED: 'invite.created',
  REVOKED: 'invite.revoked',
  RESEND: 'invite.resend',
  RESPONDED: 'invite.responded',
  BULK_CREATED: 'invite.bulk.created',
} as const;

export type InvitesEventName =
  (typeof INVITES_EVENTS)[keyof typeof INVITES_EVENTS];

// =============================================================================
// SHARED VALUE OBJECTS
// =============================================================================

/**
 * Lightweight project projection embedded inside event payloads. The
 * notifications listener and the activity feed only need `id` and
 * `name`; everything else is a coupling vector waiting to happen.
 *
 * Hydrated by `InviteCommandService` via the outbound
 * `ProjectLookupPort` (bound to a `ProjectLookupAdapter` inside
 * `ProjectsModule` in Step 3) — never by reaching into
 * `ProjectsService` directly.
 */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
}

// =============================================================================
// EVENT PAYLOADS
// =============================================================================

/**
 * Fields shared by every invite event. `timestamp` is the moment the
 * DB write committed (not the moment the event was dispatched), so
 * consumers can deduplicate / order events deterministically.
 */
interface BaseInviteEvent {
  readonly invite: InviteSummary;
  readonly project: ProjectSummary;
  readonly timestamp: Date;
}

/** Emitted after a single invite row is successfully created. */
export type InviteCreatedEvent = BaseInviteEvent;

/** Emitted after a pending invite is revoked by its inviter. */
export type InviteRevokedEvent = BaseInviteEvent;

/**
 * Emitted when the inviter requests a reminder. No DB state change —
 * the event exists purely to wake the notifications module.
 */
export type InviteResendEvent = BaseInviteEvent;

/**
 * Emitted after the invitee responds. `accept=false` paths carry the
 * optional `reason` so the notifications module can render a richer
 * rejection notice for the inviter.
 *
 * `invitee` is a lightweight projection (id / name / email only — no
 * auth secrets) that the notifications listener uses to build the
 * inviter-facing message copy without having to round-trip through
 * `IUserProfileReader`. Optional because shadow-account invites
 * (email-only) never reach `respondToInvite` and therefore never emit
 * this event, but defensive null-handling keeps consumers honest.
 */
export interface InviteRespondedEvent extends BaseInviteEvent {
  readonly accept: boolean;
  readonly reason?: string;
  readonly invitee: InviteUserRef | null;
}

/**
 * Emitted once per bulk-invite request after the transaction
 * commits. `created` carries the successful invites; partial failures
 * are NOT included in the event — they are returned to the caller
 * synchronously via `BulkInviteResult.failed`.
 */
export interface InviteBulkCreatedEvent {
  readonly project: ProjectSummary;
  readonly inviterId: string;
  readonly created: readonly InviteSummary[];
  readonly timestamp: Date;
}

/**
 * Union of every event the invites module emits.
 *
 * `InviteCreatedEvent`, `InviteRevokedEvent`, and `InviteResendEvent`
 * are structurally identical to `BaseInviteEvent`, so the union is
 * deduplicated to the three distinct shapes the consumer needs to
 * narrow on. Use the individual event types (e.g.
 * `InviteCreatedEvent`) on `@OnEvent` handler parameters to preserve
 * semantic intent at the consumer site.
 */
export type InvitesEvent =
  | BaseInviteEvent
  | InviteRespondedEvent
  | InviteBulkCreatedEvent;

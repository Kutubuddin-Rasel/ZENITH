/**
 * Notification event payload types — Step 3 of the invites refactor.
 *
 * These types are re-exports of the DTO-shaped contracts published by
 * the invites module. The previous version embedded TypeORM entities
 * (`Invite`, `Project`, `User`), which made the notifications listener
 * a hidden coupling vector for ORM metadata and lazy relations.
 *
 * The DTO shapes (`InviteSummary` + `ProjectSummary`) carry every
 * field the listener actually reads (`invite.id`, `invite.inviteeId`,
 * `invite.inviterId`, `invite.projectId`, `invite.role`, `project.id`,
 * `project.name`) — no entity reach-through required.
 *
 * The legacy `invitee: User` field that lived on `InviteRespondedPayload`
 * is dropped: the listener only used it to obtain `inviteeId`, which
 * is already on `InviteSummary`. The `message` string used by the
 * notification copy is now built by the listener from
 * `payload.invite.inviteeId` + the `accept`/`reason` flags (the
 * inviter sees who responded via the existing notification context).
 */

import type {
  InviteCreatedEvent,
  InviteRespondedEvent,
  InviteResendEvent,
  InviteRevokedEvent,
} from '../../invites/events/invites-events';

export type InviteCreatedPayload = InviteCreatedEvent;
export type InviteResendPayload = InviteResendEvent;
export type InviteRespondedPayload = InviteRespondedEvent;
export type InviteRevokedPayload = InviteRevokedEvent;

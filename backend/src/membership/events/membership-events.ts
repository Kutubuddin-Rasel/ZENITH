/**
 * Membership Event Payloads — Typed Contracts for Event-Driven Architecture
 *
 * These interfaces define the shape of events emitted by ProjectMembersService.
 * Consumers (NotificationsListener, ActivityFeedListener, WebhooksService, etc.)
 * can subscribe via @OnEvent('member.added') and receive strongly-typed payloads.
 *
 * EVENT NAMING CONVENTION:
 *   member.added        — New member joined a project
 *   member.removed      — Member was removed from a project
 *   member.role_changed — Member's role was updated
 *
 * TIMING: All events are emitted AFTER the DB write succeeds.
 * This prevents phantom notifications if the write fails.
 *
 * @see ProjectMembersService for emission points
 */

import { ProjectRole } from '../enums/project-role.enum';

// =============================================================================
// EVENT NAME CONSTANTS
// =============================================================================

/**
 * Event name constants to prevent typos in emitter/subscriber coupling.
 * Use these instead of raw strings.
 */
export const MEMBERSHIP_EVENTS = {
  MEMBER_ADDED: 'member.added',
  MEMBER_REMOVED: 'member.removed',
  MEMBER_ROLE_CHANGED: 'member.role_changed',
} as const;

// =============================================================================
// EVENT PAYLOADS
// =============================================================================

/** Base fields shared by all membership events */
interface BaseMembershipEvent {
  /** Project the membership change occurred in */
  readonly projectId: string;

  /** User whose membership was affected */
  readonly userId: string;

  /** Timestamp of the event (ISO 8601) */
  readonly timestamp: Date;

  /** User who performed the action (from CLS/JWT context) */
  readonly actorId: string;
}

/** Emitted when a new member is added to a project */
export interface MemberAddedEvent extends BaseMembershipEvent {
  /** Role assigned to the new member */
  readonly roleName: ProjectRole;
}

/** Emitted when a member is removed from a project */
export interface MemberRemovedEvent extends BaseMembershipEvent {
  /** Role the member had before removal (for context in notifications) */
  readonly roleName: ProjectRole;
}

/** Emitted when a member's role is changed */
export interface MemberRoleChangedEvent extends BaseMembershipEvent {
  /** Previous role before the change */
  readonly oldRole: ProjectRole;

  /** New role after the change */
  readonly newRole: ProjectRole;
}

/** Union type for all membership events */
export type MembershipEvent =
  | MemberAddedEvent
  | MemberRemovedEvent
  | MemberRoleChangedEvent;

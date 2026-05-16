/**
 * Event Factory Contracts (canonical home, post Step 4 demolition).
 *
 * Four injectable factories — one per domain — replaced the static
 * event-factory god-class. Each domain depends on exactly one contract
 * (ISP) and binds to its own DI token (DIP). Payload shapes live here
 * permanently; no dependency on the deleted static class.
 */

/**
 * Base event payload included in every domain event envelope.
 */
export interface BaseEventPayload {
  projectId: string;
  actorId: string;
  timestamp: Date;
}

/**
 * Issue lifecycle event types.
 */
export type IssueEventType =
  | 'issue.created'
  | 'issue.updated'
  | 'issue.deleted'
  | 'issue.archived'
  | 'issue.unarchived';

export interface IssueEventPayload extends BaseEventPayload {
  issueId: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface SprintEventPayload extends BaseEventPayload {
  sprintId: string;
  issueId: string | null;
  action: string;
  sprintName: string;
}

export interface BoardEventPayload extends BaseEventPayload {
  boardId?: string;
  issueId: string | null;
  action: string;
  boardName: string;
  columnName?: string;
}

export interface InviteEventPayload extends BaseEventPayload {
  inviteId: string;
  email?: string;
  action: 'created' | 'revoked' | 'resend' | 'responded' | 'expired';
}

/**
 * IIssueEventFactory — produces typed envelopes for issue lifecycle events.
 * The envelope shape `{ type, payload }` is consumed by the EventEmitter2
 * dispatcher and the realtime gateway.
 */
export interface IIssueEventFactory {
  create(
    type: IssueEventType,
    data: {
      projectId: string;
      issueId: string;
      actorId: string;
      changes?: Record<string, { from: unknown; to: unknown }>;
    },
  ): { type: IssueEventType; payload: IssueEventPayload };
}

/**
 * ISprintEventFactory — produces typed payloads for sprint lifecycle events.
 */
export interface ISprintEventFactory {
  create(data: {
    projectId: string;
    sprintId: string;
    actorId: string;
    action: string;
    sprintName: string;
    issueId?: string;
  }): SprintEventPayload;
}

/**
 * IBoardEventFactory — produces typed payloads for board / column events.
 */
export interface IBoardEventFactory {
  create(data: {
    projectId: string;
    actorId: string;
    action: string;
    boardName: string;
    boardId?: string;
    issueId?: string;
    columnName?: string;
  }): BoardEventPayload;
}

/**
 * IInviteEventFactory — produces typed payloads for membership-invite events.
 */
export interface IInviteEventFactory {
  create(data: {
    projectId: string;
    inviteId: string;
    actorId: string;
    email?: string;
    action: 'created' | 'revoked' | 'resend' | 'responded' | 'expired';
  }): InviteEventPayload;
}

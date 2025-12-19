/**
 * Event Factory
 *
 * Centralizes event payload construction for consistent structure
 * across all domain events (issues, sprints, boards, etc.).
 *
 * Benefits:
 * - Consistent timestamp format
 * - Type-safe payloads
 * - Single place to add new fields (e.g., correlationId)
 */

/**
 * Base event payload included in all events
 */
export interface BaseEventPayload {
  projectId: string;
  actorId: string;
  timestamp: Date;
}

/**
 * Issue event types
 */
export type IssueEventType =
  | 'issue.created'
  | 'issue.updated'
  | 'issue.deleted'
  | 'issue.archived'
  | 'issue.unarchived';

/**
 * Issue event payload
 */
export interface IssueEventPayload extends BaseEventPayload {
  issueId: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

/**
 * Sprint event payload
 */
export interface SprintEventPayload extends BaseEventPayload {
  sprintId: string;
  issueId: string | null;
  action: string;
  sprintName: string;
}

/**
 * Board event payload
 */
export interface BoardEventPayload extends BaseEventPayload {
  boardId?: string;
  issueId: string | null;
  action: string;
  boardName: string;
  columnName?: string;
}

/**
 * Invite event payload
 */
export interface InviteEventPayload extends BaseEventPayload {
  inviteId: string;
  email: string;
  action: 'created' | 'revoked' | 'resend' | 'responded';
}

/**
 * Event Factory - Static methods for creating standardized event payloads
 */
export class EventFactory {
  /**
   * Create an issue event payload
   */
  static createIssueEvent(
    type: IssueEventType,
    data: {
      projectId: string;
      issueId: string;
      actorId: string;
      changes?: Record<string, { from: unknown; to: unknown }>;
    },
  ): { type: IssueEventType; payload: IssueEventPayload } {
    return {
      type,
      payload: {
        projectId: data.projectId,
        issueId: data.issueId,
        actorId: data.actorId,
        changes: data.changes,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Create a sprint event payload
   */
  static createSprintEvent(data: {
    projectId: string;
    sprintId: string;
    actorId: string;
    action: string;
    sprintName: string;
    issueId?: string;
  }): SprintEventPayload {
    return {
      projectId: data.projectId,
      sprintId: data.sprintId,
      actorId: data.actorId,
      issueId: data.issueId || null,
      action: data.action,
      sprintName: data.sprintName,
      timestamp: new Date(),
    };
  }

  /**
   * Create a board event payload
   */
  static createBoardEvent(data: {
    projectId: string;
    actorId: string;
    action: string;
    boardName: string;
    boardId?: string;
    issueId?: string;
    columnName?: string;
  }): BoardEventPayload {
    return {
      projectId: data.projectId,
      actorId: data.actorId,
      boardId: data.boardId,
      issueId: data.issueId || null,
      action: data.action,
      boardName: data.boardName,
      columnName: data.columnName,
      timestamp: new Date(),
    };
  }

  /**
   * Create an invite event payload
   */
  static createInviteEvent(data: {
    projectId: string;
    inviteId: string;
    actorId: string;
    email: string;
    action: 'created' | 'revoked' | 'resend' | 'responded';
  }): InviteEventPayload {
    return {
      projectId: data.projectId,
      inviteId: data.inviteId,
      actorId: data.actorId,
      email: data.email,
      action: data.action,
      timestamp: new Date(),
    };
  }
}

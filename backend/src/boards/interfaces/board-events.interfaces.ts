// src/boards/interfaces/board-events.interfaces.ts

/**
 * Realtime Payloads for Board Delta Updates
 *
 * RELOCATED from `gateways/dto/board-events.dto.ts`. These describe board
 * DOMAIN events, and `boards` is the module that produces them — the gateway
 * only transports them. Keeping them here is what lets the `boards → gateways`
 * dependency be inverted: `BoardRealtimePort` (this module) can type its
 * arguments without either side importing the other's internals.
 *
 * Designed for "delta updates" — the frontend patches its React Query cache
 * directly instead of calling refetch(). That is why each payload carries a
 * full row snapshot rather than just an id.
 */

/**
 * Slim issue data for realtime payloads.
 * Contains every field needed to render a Kanban card without a follow-up read.
 */
export interface SlimIssuePayload {
  id: string;
  title: string;
  number: number | null;
  status: string;
  statusId: string;
  priority: string;
  type: string;
  assigneeId?: string | null;
  assigneeName?: string;
  assigneeAvatar?: string;
  lexorank: string;
  storyPoints: number;
  labels?: string[];
  dueDate?: string | null;
}

/**
 * Payload for issue movement events.
 *
 * Sent when an issue is dragged to a new column or reordered.
 */
export interface IssueMovedPayload {
  // Who made the change (for UI feedback)
  userId: string;
  userName: string;
  timestamp: string;

  // What moved
  issueId: string;
  issue: SlimIssuePayload;

  // Where it moved from/to
  fromColumnId: string;
  toColumnId: string;
  newIndex: number;

  // Board context
  boardId: string;
  projectId: string;
}

/** Payload for issue created events. */
export interface IssueCreatedPayload {
  userId: string;
  userName: string;
  timestamp: string;
  issue: SlimIssuePayload;
  columnId: string;
  boardId: string;
  projectId: string;
}

/** Payload for issue updated events (title, description, etc.). */
export interface IssueUpdatedPayload {
  userId: string;
  userName: string;
  timestamp: string;
  issueId: string;
  issue: SlimIssuePayload;
  changedFields: string[];
  boardId: string;
  projectId: string;
}

/** Payload for issue deleted events. */
export interface IssueDeletedPayload {
  userId: string;
  userName: string;
  timestamp: string;
  issueId: string;
  columnId: string;
  boardId: string;
  projectId: string;
}

/**
 * Payload for issue reorder events within a column.
 * Carries the new ordering so clients update locally without refetch.
 */
export interface IssueReorderedPayload {
  projectId: string;
  boardId: string;
  columnId: string;
  issues: string[]; // array of issueIds in new order
}

/** Payload for column reorder events on a board. */
export interface ColumnsReorderedPayload {
  projectId: string;
  boardId: string;
  orderedColumnIds: string[];
}

/**
 * WebSocket Payload DTOs for Board Real-Time Updates
 *
 * These payloads are designed for "delta updates" - the frontend updates
 * its React Query cache directly instead of calling refetch().
 */

/**
 * Slim issue data for WebSocket payloads
 * Contains all fields needed to render a card in the Kanban board
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
 * Payload for issue movement events
 *
 * Sent when an issue is dragged to a new column or reordered.
 * Contains all data needed for frontend cache update without refetch.
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

/**
 * Payload for issue created events
 */
export interface IssueCreatedPayload {
  userId: string;
  userName: string;
  timestamp: string;
  issue: SlimIssuePayload;
  columnId: string;
  boardId: string;
  projectId: string;
}

/**
 * Payload for issue updated events (title, description, etc.)
 */
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

/**
 * Payload for issue deleted events
 */
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
 * Payload for issue reorder events within a column
 *
 * Sent when issues are drag-reordered within the same column.
 * Contains the new ordering so clients can update without refetch.
 */
export interface IssueReorderedPayload {
  projectId: string;
  boardId: string;
  columnId: string;
  issues: string[]; // array of issueIds in new order
}

/**
 * Payload for column reorder events on a board
 *
 * Sent when board columns are reordered via drag-and-drop.
 */
export interface ColumnsReorderedPayload {
  projectId: string;
  boardId: string;
  orderedColumnIds: string[];
}

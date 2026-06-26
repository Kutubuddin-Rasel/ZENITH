/**
 * Backlog Module — ISP Contract Layer
 *
 * The backlog manages the prioritised queue of issues NOT currently in an
 * active sprint. It owns NO table of its own: the backlog is the `Issue`
 * aggregate left-joined against `sprint_issues` where the issue has no
 * sprint membership and is not archived. Ordering state lives as the
 * `Issue.backlogOrder` column.
 *
 * Because the backlog never owns the rows it orders, these contracts are
 * deliberately split (CQRS + single-writer invariant):
 *
 *  - `IBacklogQuery`    — the cached READ surface. Returns `IssueView`
 *                         (the issues barrel projection), never the `Issue`
 *                         entity, so the persistence type stops leaking
 *                         across the module boundary. Backed by a
 *                         backlog-owned read projection (the
 *                         ClickHouse-isolation seam, Step 2).
 *  - `IBacklogOrdering` — the WRITE surface. It enforces the project-role
 *                         authorization rules, then DELEGATES the actual
 *                         Issue-row mutations to the issues aggregate via
 *                         `ISSUE_RANKING_TOKEN` (EntityManager passthrough),
 *                         restoring the single-writer invariant: only the
 *                         Issue aggregate mutates `issues` rows.
 */

import type { IssueView } from '../../issues';
import type { BacklogQueryDto } from '../dto/backlog-query.dto';
import type { MoveBacklogItemDto } from '../dto/move-backlog-item.dto';

// ---------------------------------------------------------------------------
// Response contract types (re-homed from `dto/backlog-query.dto.ts`)
// ---------------------------------------------------------------------------

/**
 * Pagination metadata for a backlog page.
 */
export interface BacklogPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * A paginated slice of the backlog.
 */
export interface PaginatedBacklogResponse<T> {
  data: T[];
  meta: BacklogPaginationMeta;
}

// ---------------------------------------------------------------------------
// ISP service surfaces (CQRS read/write split)
// ---------------------------------------------------------------------------

/**
 * Cached read surface — lists the prioritised backlog for a project.
 * Membership-validated; returns the `IssueView` projection (not `Issue`).
 */
export interface IBacklogQuery {
  getBacklog(
    projectId: string,
    userId: string,
    query?: BacklogQueryDto,
  ): Promise<PaginatedBacklogResponse<IssueView>>;
}

/**
 * Mutation surface — reorders the backlog. Authorizes the caller against
 * the project role rules, then delegates every Issue-row write to the
 * issues aggregate (`ISSUE_RANKING_TOKEN`) and invalidates the read cache.
 */
export interface IBacklogOrdering {
  /**
   * Move a single issue to a new position, renumbering the affected slice.
   * `moveItem` is restricted to PROJECT_LEAD. Returns the reordered backlog
   * as `IssueView[]`.
   */
  moveItem(
    projectId: string,
    userId: string,
    dto: MoveBacklogItemDto,
  ): Promise<IssueView[]>;

  /**
   * Bulk-apply an explicit ordering of issue IDs. Permitted for
   * PROJECT_LEAD or MEMBER. Atomic on the issues side.
   */
  reorderItems(
    projectId: string,
    userId: string,
    issueIds: string[],
  ): Promise<void>;
}

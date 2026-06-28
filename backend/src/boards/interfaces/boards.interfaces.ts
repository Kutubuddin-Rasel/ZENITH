/**
 * Boards Module — Abstract Contracts (ISP Surface)
 *
 * These interfaces are the ONLY allowed coupling point between the
 * boards module and the rest of Zenith (Level 3 aggregate that owns
 * Kanban/Scrum board lifecycle, the `BoardColumn` sub-aggregate, and
 * drag-and-drop ordering primitives). Concrete services, the
 * persistence entities `Board` and `BoardColumn`, the controllers,
 * the gateway, and the HTTP DTOs are implementation details that
 * must never leak across the module boundary.
 *
 * DTO Strategy
 * ------------
 * `BoardSummary`, `BoardColumnView`, `BoardWithColumns`,
 * `KanbanBoardView`, `KanbanColumnView`, and `KanbanCardView` are
 * pure value-object views — they intentionally do NOT extend the
 * TypeORM entities so consumers cannot accidentally depend on ORM
 * metadata, lifecycle decorators, lazy relations, or the
 * cross-aggregate `Project.organization` reference embedded in
 * `Board.project`.
 *
 * Each view is designed as a **structural subset** of the
 * corresponding entity: TypeScript's covariance lets the existing
 * `BoardsService` (which returns `Promise<Board>` /
 * `Promise<BoardColumn>`) satisfy the interface methods without a
 * single body change in Step 1. Step 3 will narrow the new CQRS
 * services to return view DTOs directly via `board.mapper.ts`.
 *
 * Segregation Rationale (ISP)
 * ---------------------------
 *  - `IBoardQuery` / `IBoardCommand` split keeps read-heavy
 *    consumers (sprints, the Kanban controller) decoupled from
 *    mutating capabilities (the HTTP controller, project-templates
 *    seeder via `BoardSeedPort`).
 *  - `IBoardColumnCommand` is isolated because column writes are a
 *    sub-aggregate concern that does NOT emit the same audit/event
 *    surface as board lifecycle writes — splitting it keeps the
 *    column command service free of the cache-tag invalidation
 *    obligations that lifecycle writes carry.
 *  - `IBoardOrderingCommand` is separated from `IBoardCommand`
 *    because the ordering surface broadcasts realtime payloads via
 *    `BoardGateway` (NOT EventEmitter2 audit events) and is the only
 *    surface that reaches into the issues aggregate. Different
 *    downstream contracts, different testing surface — different
 *    interface.
 *
 * The repository contracts (`BoardRepository`, `IssueRepository`,
 * and `BoardColumnRepository` once Step 2 promotes columns to
 * Tier-1) live under `backend/src/database/repositories/` because
 * the persistence boundary is shared infrastructure — bound inside
 * `DatabaseModule` and consumed via the abstract class, never via
 * `@InjectRepository(...)` (see `SOLID_STANDARDS.md` DIP rubric,
 * severity CRITICAL).
 */

import type { BoardType } from '../enums/board-type.enum';
import type { CreateBoardDto } from '../dto/create-board.dto';
import type { UpdateBoardDto } from '../dto/update-board.dto';
import type { CreateColumnDto } from '../dto/create-column.dto';
import type { UpdateColumnDto } from '../dto/update-column.dto';

// ===========================================================================
// Value-Object Views (DTOs) — zero TypeORM coupling
// ===========================================================================

// ---------------------------------------------------------------------------
// Board core projection
// ---------------------------------------------------------------------------

/**
 * Minimal projection of a board row. Used by list endpoints and any
 * read path that does not need columns or issues. Designed as a
 * structural subset of `Board` so the legacy service can return
 * `Promise<Board>` and still satisfy `Promise<BoardSummary>` (`Board`
 * carries every field below).
 *
 * `description: string | null` — the entity declares `string` but the
 * underlying column is nullable; using the union here is honest
 * about persistence and remains assignable from the entity.
 */
export interface BoardSummary {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly type: BoardType;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// BoardColumn sub-aggregate projection
// ---------------------------------------------------------------------------

/**
 * Pure projection of a `BoardColumn` row. Excludes the back-pointer
 * `board` relation (cross-aggregate ORM leakage) and the
 * `workflowStatus` lazy join. `statusId` is widened to
 * `string | null` for honesty — the entity declares `string` but the
 * column is nullable in PostgreSQL.
 */
export interface BoardColumnView {
  readonly id: string;
  readonly boardId: string;
  readonly name: string;
  readonly statusId: string | null;
  readonly columnOrder: number;
}

/**
 * Board read-side projection that includes its columns. Returned by
 * `IBoardQuery.findOne` and `IBoardCommand.create`. The columns
 * array is `readonly` from the consumer's perspective; the legacy
 * service supplies a mutable `BoardColumn[]` (structurally
 * assignable).
 */
export interface BoardWithColumns extends BoardSummary {
  readonly columns: readonly BoardColumnView[];
}

// ---------------------------------------------------------------------------
// Kanban (slim) projection — drives the primary board UI endpoint
// ---------------------------------------------------------------------------

/**
 * Slim issue projection used by the Kanban board view
 * (`/projects/:projectId/boards/:boardId/slim`). Excludes heavy
 * fields (`description`, `metadata`, `embedding`) so the standup
 * refresh storm does not paginate the entire issue body.
 *
 * `type` and `priority` are exposed as `string` (not the enum union)
 * to match the legacy controller payload exactly — the frontend
 * narrows on its own end.
 */
export interface KanbanCardView {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly priority: string;
  readonly assigneeId: string | null;
  readonly storyPoints: number;
  readonly status: string;
  readonly statusId: string | null;
  readonly backlogOrder: number;
}

/**
 * Kanban column with embedded slim cards. `statusId` is the FK to
 * `WorkflowStatus`; legacy boards seeded before the relational-status
 * migration may carry `null` here, in which case the grouping
 * fallback in `findOneWithIssues` matches by column name.
 */
export interface KanbanColumnView {
  readonly id: string;
  readonly name: string;
  readonly statusId: string | null;
  readonly columnOrder: number;
  readonly issues: readonly KanbanCardView[];
}

/**
 * Aggregate return type for `IBoardQuery.findOneWithIssues`. Mirrors
 * the legacy inline shape exactly (including `board: BoardSummary`
 * rather than the full `Board` entity) so the 5-second micro-cache
 * value remains binary-compatible across the refactor.
 */
export interface KanbanBoardView {
  readonly board: BoardSummary;
  readonly columns: readonly KanbanColumnView[];
}

// ===========================================================================
// Read Surfaces — pure queries, no audit, no events, no policy mutations
// ===========================================================================

/**
 * Board read surface. Consumed by every non-mutating caller of the
 * boards aggregate (sprints, the `boards.controller` read endpoints,
 * future analytics integrations). Every implementation MUST enforce
 * the caller's project-membership BEFORE returning data — read-side
 * tenant isolation lives here, not on a guard, because the queries
 * cross project boundaries (e.g. legacy data without `statusId`
 * matching falls back to name grouping which is project-scoped).
 */
export interface IBoardQuery {
  /**
   * List every board owned by the project. Caller must be a project
   * member (any `ProjectRole`); the implementation throws
   * `ForbiddenException` otherwise. The optional `organizationId`
   * acts as a tenant filter — when provided, the project lookup is
   * scoped to it (multi-tenant isolation).
   */
  findAll(
    projectId: string,
    userId: string,
    organizationId?: string,
  ): Promise<readonly BoardSummary[]>;

  /**
   * Resolve a single board with its columns. Throws
   * `NotFoundException` when the board does not exist or the
   * `organizationId` filter excludes it. Columns are sorted by
   * `columnOrder` ascending before return (UI contract).
   */
  findOne(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId?: string,
  ): Promise<BoardWithColumns>;

  /**
   * Slim Kanban projection — board + columns + slim issues. The
   * primary endpoint behind `/projects/:projectId/boards/:boardId/slim`.
   * Implementations MUST cache the result with a short TTL (≤ 5 s)
   * to survive standup refresh storms; cache key MUST be tagged
   * `board:{id}` so lifecycle/column/ordering mutations invalidate
   * it on commit.
   */
  findOneWithIssues(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId?: string,
  ): Promise<KanbanBoardView>;
}

// ===========================================================================
// Write Surfaces — mutations with audit + cache invalidation
// ===========================================================================

/**
 * Board lifecycle write surface. Every mutation MUST:
 *   1. Verify the caller is `PROJECT_LEAD` BEFORE mutating state
 *      (delegates to `IProjectMemberQuery.getUserRole`).
 *   2. Persist through abstract repositories
 *      (`BoardRepository`, `BoardColumnRepository`) — never via
 *      `@InjectRepository(...)` or raw `DataSource` queries.
 *   3. Emit a `board.event` audit payload via `EventEmitter2` AFTER
 *      the DB write commits.
 *   4. Invalidate cache tag `board:{id}` AFTER commit
 *      (fire-and-forget on Redis outage).
 *
 * Step 3 extracts this surface into `BoardCommandService` with a
 * `dataSource.transaction()` wrapper covering board insert + column
 * seeding (today's `create()` saves them in two separate writes — a
 * crash between them leaves an orphan board).
 */
export interface IBoardCommand {
  /**
   * Create a board (and seed default columns). The Step 3
   * implementation wraps board + columns in a single transaction;
   * Step 1 implementation (legacy) does NOT — the transactional gap
   * is the headline DIP/atomicity fix for Step 2/3.
   *
   * `dto.columns` is the loosely-typed legacy shape (`any[]`); when
   * absent, defaults are seeded per `BoardType` (Kanban → 3
   * columns, Scrum → 4).
   */
  create(
    projectId: string,
    userId: string,
    dto: CreateBoardDto,
    organizationId?: string,
  ): Promise<BoardWithColumns>;

  /**
   * Patch a board's mutable metadata (`name`, `type`,
   * `description`). Throws `ForbiddenException` for non-leads,
   * `NotFoundException` when the board lies outside the caller's
   * tenant.
   */
  update(
    projectId: string,
    boardId: string,
    userId: string,
    dto: UpdateBoardDto,
    organizationId?: string,
  ): Promise<BoardSummary>;

  /**
   * Delete a board. Cascade-removes its columns
   * (`Board.@OneToMany(() => BoardColumn, { cascade: true })`).
   * Issues are NOT removed — they remain in the project's backlog
   * with their `status` / `statusId` intact.
   */
  remove(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void>;
}

/**
 * Board column (sub-aggregate) write surface. Same role enforcement,
 * audit, and cache-invalidation contract as `IBoardCommand`, but
 * scoped to column rows. Separated because:
 *   - column writes do NOT seed defaults (no transactional pairing
 *     with a parent insert),
 *   - column delete is structurally distinct from board delete
 *     (no cascade implications),
 *   - the Step 3 `BoardColumnCommandService` is the binding target
 *     for the future `BoardColumnRepository` (Step 2) — keeping the
 *     surface segregated lets that wiring land without touching the
 *     board lifecycle service.
 */
export interface IBoardColumnCommand {
  /**
   * Append a column to a board. `dto.columnOrder` defaults to the
   * end of the current list when omitted (controller-side
   * convention). Throws `ForbiddenException` for non-leads.
   */
  addColumn(
    projectId: string,
    boardId: string,
    userId: string,
    dto: CreateColumnDto,
    organizationId?: string,
  ): Promise<BoardColumnView>;

  /**
   * Patch a column's mutable fields (`name`, `statusId`,
   * `columnOrder`). Throws `NotFoundException` when the column does
   * not belong to the board (tenant isolation).
   */
  updateColumn(
    projectId: string,
    boardId: string,
    colId: string,
    userId: string,
    dto: UpdateColumnDto,
    organizationId?: string,
  ): Promise<BoardColumnView>;

  /**
   * Delete a column. Issues whose `status` or `statusId` matched
   * the deleted column REMAIN in the project — they continue to
   * exist in the backlog and may surface in other boards.
   */
  removeColumn(
    projectId: string,
    boardId: string,
    colId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void>;
}

/**
 * Realtime ordering write surface — the only surface that
 * broadcasts via `BoardGateway` (Socket.IO) instead of emitting
 * audit events through `EventEmitter2`. Drag-and-drop UX primitives
 * live here:
 *   - column reorder (board scope),
 *   - issue move between columns (status-change side effect),
 *   - issue reorder within a column.
 *
 * Step 3's `BoardOrderingService` consumes `WorkflowLookupPort`
 * (Step 1) instead of reaching across the workflows aggregate via
 * `dataSource.getRepository(WorkflowStatus)` — the only outbound
 * coupling allowed from this surface. Issue reordering and column
 * reordering are bulk-DML operations; Step 2 absorbs the raw SQL
 * into `BoardColumnRepository.bulkReorder` and
 * `IssueRepository.bulkReorderInColumn` so this surface speaks pure
 * repository calls.
 */
export interface IBoardOrderingCommand {
  /**
   * Persist a new left-to-right column order. Implementation MUST
   * be a single bulk-UPDATE (parameterized VALUES clause) — N
   * individual saves are forbidden (UX latency budget on the
   * standup board is ≤ 50 ms server-side).
   */
  reorderColumns(
    projectId: string,
    boardId: string,
    orderedColumnIds: string[],
    userId: string,
    organizationId?: string,
  ): Promise<void>;

  /**
   * Move an issue between columns by `WorkflowStatus.id`. The
   * implementation looks up the status name (legacy sync field on
   * `Issue.status`) via `WorkflowLookupPort` — NO direct
   * `WorkflowStatus` entity import is permitted from this surface
   * in Step 2+.
   */
  moveIssue(
    projectId: string,
    boardId: string,
    issueId: string,
    toStatusId: string,
    newOrder: number,
    userId: string,
    organizationId?: string,
  ): Promise<void>;

  /**
   * Persist a new top-to-bottom issue order within a column.
   * Bulk-DML like `reorderColumns`; the Step 2 implementation
   * delegates to `IssueRepository.bulkReorderInColumn`.
   */
  reorderIssues(
    projectId: string,
    boardId: string,
    columnId: string,
    orderedIssueIds: string[],
    userId: string,
    organizationId?: string,
  ): Promise<void>;
}

import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  SaveOptions,
} from 'typeorm';
import { Readable } from 'stream';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { Issue } from '../../issues/entities/issue.entity';
import { IssueLink } from '../../issues/entities/issue-link.entity';
import { WorkLog } from '../../issues/entities/work-log.entity';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { Board } from '../../boards/entities/board.entity';
import { BoardColumn } from '../../boards/entities/board-column.entity';

/**
 * Role-segregated repository interfaces (ISP).
 *
 * Each aggregate exposes a `*Reader` (queries) and a `*Writer` (mutations) so
 * services depend ONLY on the methods they actually invoke. Concrete
 * `TypeOrm*Repository` classes (Step 2) implement BOTH the relevant
 * `BaseRepository<TEntity>` and the role interfaces below.
 *
 * Conventions:
 *  - PK is `string` (UUID) for every Tier-1 aggregate.
 *  - Reads return `null` (never `undefined`) when the row is absent.
 *  - Writers expose `softRemove`/`restore` ONLY for entities that declare
 *    `@DeleteDateColumn` (currently: Project).
 */

// =============================================================================
// Shared DTO types (used by service-facing repository methods)
// =============================================================================

/** Free-text + categorical filters for list-style Issue queries. */
export interface IssueFilters {
  status?: string;
  assigneeId?: string;
  search?: string;
  label?: string;
  sprint?: string;
  sort?: string;
  includeArchived?: boolean;
  type?: string;
}

/** Slim issue projection shaped for Kanban board rendering. */
export interface KanbanCard {
  id: string;
  title: string;
  type: string;
  priority: string;
  assigneeId: string | null;
  storyPoints: number;
  status: string;
  statusId: string | null;
  backlogOrder: number;
}

/**
 * Result of `IssueRepository.moveToStatus` — returns BOTH the post-mutation
 * issue and the `prevStatusId` so the caller (`BoardOrderingService.moveIssue`)
 * can populate the realtime gateway event without an extra round-trip.
 *
 * Encapsulates the read-modify-save flow previously inlined in
 * `BoardsService.moveIssue` (DIP severity CRITICAL — `boards.service.ts:625`
 * reached across the workflows aggregate boundary via
 * `dataSource.getRepository(WorkflowStatus)` to keep `Issue.status` in sync
 * with `Issue.statusId`).
 */
export interface IssueMoveResult {
  /** The Issue row AFTER the status/order mutation. */
  readonly issue: Issue;
  /** `statusId` BEFORE the mutation — required by the gateway broadcast. */
  readonly prevStatusId: string | null;
}

/** Currency-safe billable aggregate computed in NUMERIC at the DB layer. */
export interface BillableAggregate {
  totalMinutes: number;
  billableMinutes: number;
  amountCents: number;
}

/** Scope for billable aggregation queries. */
export interface BillableScope {
  issueId?: string;
  projectId?: string;
}

/** Project membership reference returned alongside a user row. */
export interface UserMembershipProjectRef {
  projectId: string;
  projectName: string | null;
  projectKey: string | null;
  roleName: string | null;
}

/** User enriched with their project memberships. */
export interface UserWithMemberships {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  defaultRole: string;
  projectMemberships: UserMembershipProjectRef[];
}

/** Slim user row for search/list endpoints. */
export interface UserSearchRow {
  id: string;
  name: string;
  email: string;
  defaultRole: string;
}

// =============================================================================
// Issue
// =============================================================================
export interface IIssueReader {
  findById(id: string): Promise<Issue | null>;
  findOne(options: FindOneOptions<Issue>): Promise<Issue | null>;
  findMany(options?: FindManyOptions<Issue>): Promise<Issue[]>;
  findAndCount(options?: FindManyOptions<Issue>): Promise<[Issue[], number]>;
  findByProject(
    projectId: string,
    options?: FindManyOptions<Issue>,
  ): Promise<Issue[]>;
  /** Multi-filter list view used by the issues list endpoint. */
  findFilteredByProject(
    projectId: string,
    filters?: IssueFilters,
  ): Promise<Issue[]>;
  /** Streaming cursor for CSV export — caller is responsible for closing. */
  streamForExport(projectId: string): Promise<Readable>;
  /** Status histogram for project-summary aggregation. */
  countByStatusForProject(
    projectId: string,
  ): Promise<{ status: string; count: number }[]>;
  /** Board-shaped projection of all non-archived issues in a project. */
  findKanbanCards(projectId: string): Promise<KanbanCard[]>;
  count(where?: FindOptionsWhere<Issue>): Promise<number>;
  exists(where: FindOptionsWhere<Issue>): Promise<boolean>;
}

export interface IIssueWriter {
  create(data: DeepPartial<Issue>): Issue;
  save(data: DeepPartial<Issue>, options?: SaveOptions): Promise<Issue>;
  saveMany(data: DeepPartial<Issue>[], options?: SaveOptions): Promise<Issue[]>;
  update(id: string, patch: QueryDeepPartialEntity<Issue>): Promise<void>;
  remove(entity: Issue): Promise<Issue>;
  /**
   * Bulk-reorder issues within a single kanban column.
   *
   * Encapsulates the parameterized VALUES-based UPDATE that previously lived
   * inline at `boards.service.ts:731`. Filters on (projectId, status) so
   * cross-project / cross-column writes are impossible even if a malicious
   * orderedIssueIds list is supplied.
   *
   * @param projectId       Tenant scope — REQUIRED. Filtered in WHERE.
   * @param status          Column-name match for the legacy string status
   *                        column. Currently the caller passes the column
   *                        name (e.g. `"To Do"`), NOT a statusId. The contract
   *                        intentionally accepts the string to match today's
   *                        on-disk semantics; the relational-status migration
   *                        will eventually swap this to `statusId`.
   * @param orderedIssueIds Issues in their target order. `[]` is a no-op.
   *                        Implementations MUST cap the length (today: 5000)
   *                        to stay under PostgreSQL's 65k parameter limit.
   */
  bulkReorderInColumn(
    projectId: string,
    status: string,
    orderedIssueIds: readonly string[],
  ): Promise<void>;
  /**
   * Move an issue between workflow statuses and update its backlog order.
   *
   * Atomically updates `statusId` (relational source of truth), `status`
   * (legacy string mirror), and `backlogOrder`. Returns the post-mutation
   * `Issue` plus the `prevStatusId` so callers can build realtime broadcast
   * payloads without a second read.
   *
   * Replaces the inlined read-modify-save at `boards.service.ts:637-650`,
   * which was paired with an out-of-aggregate
   * `dataSource.getRepository(WorkflowStatus)` lookup that DIP forbids.
   *
   * @returns `null` if the issue does not exist (caller raises NotFound).
   */
  moveToStatus(
    projectId: string,
    issueId: string,
    toStatusId: string,
    toStatusName: string,
    newOrder: number,
  ): Promise<IssueMoveResult | null>;
}

// =============================================================================
// Project (soft-deletable: @DeleteDateColumn deletedAt)
// =============================================================================
export interface IProjectReader {
  findById(id: string): Promise<Project | null>;
  findOne(options: FindOneOptions<Project>): Promise<Project | null>;
  findMany(options?: FindManyOptions<Project>): Promise<Project[]>;
  findAndCount(
    options?: FindManyOptions<Project>,
  ): Promise<[Project[], number]>;
  findByKey(key: string): Promise<Project | null>;
  findByOrganization(
    organizationId: string,
    options?: FindManyOptions<Project>,
  ): Promise<Project[]>;
  /**
   * All non-archived projects a given user is a member of, scoped to an
   * organization. Encapsulates the project_members join.
   */
  findForMember(userId: string, organizationId: string): Promise<Project[]>;
  count(where?: FindOptionsWhere<Project>): Promise<number>;
  exists(where: FindOptionsWhere<Project>): Promise<boolean>;
}

export interface IProjectWriter {
  create(data: DeepPartial<Project>): Project;
  save(data: DeepPartial<Project>, options?: SaveOptions): Promise<Project>;
  saveMany(
    data: DeepPartial<Project>[],
    options?: SaveOptions,
  ): Promise<Project[]>;
  update(id: string, patch: QueryDeepPartialEntity<Project>): Promise<void>;
  softRemove(entity: Project): Promise<Project>;
  restore(id: string): Promise<void>;
}

// =============================================================================
// WorkLog
// =============================================================================
export interface IWorkLogReader {
  findById(id: string): Promise<WorkLog | null>;
  findOne(options: FindOneOptions<WorkLog>): Promise<WorkLog | null>;
  findMany(options?: FindManyOptions<WorkLog>): Promise<WorkLog[]>;
  findByIssue(
    issueId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]>;
  findByUser(
    userId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]>;
  findByProject(
    projectId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]>;
  /** SUM(minutesSpent) for a single issue. */
  sumMinutesByIssue(issueId: string): Promise<number>;
  /** SUM(minutesSpent) across all issues in a project. */
  sumMinutesByProject(projectId: string): Promise<number>;
  /** SUM(minutesSpent) for a user, optionally bounded by date range. */
  sumMinutesByUser(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<number>;
  /** SUM(minutesSpent) across issues attached to a sprint via sprint_issues. */
  sumMinutesBySprint(sprintId: string): Promise<number>;
  /**
   * Currency-safe billable aggregate for an issue or project scope.
   * `amountCents` is computed in NUMERIC at the DB layer to avoid float drift.
   */
  aggregateBillable(scope: BillableScope): Promise<BillableAggregate>;
  count(where?: FindOptionsWhere<WorkLog>): Promise<number>;
  exists(where: FindOptionsWhere<WorkLog>): Promise<boolean>;
}

export interface IWorkLogWriter {
  create(data: DeepPartial<WorkLog>): WorkLog;
  save(data: DeepPartial<WorkLog>, options?: SaveOptions): Promise<WorkLog>;
  saveMany(
    data: DeepPartial<WorkLog>[],
    options?: SaveOptions,
  ): Promise<WorkLog[]>;
  update(id: string, patch: QueryDeepPartialEntity<WorkLog>): Promise<void>;
  remove(entity: WorkLog): Promise<WorkLog>;
}

// =============================================================================
// User
// =============================================================================
export interface IUserReader {
  findById(id: string): Promise<User | null>;
  findOne(options: FindOneOptions<User>): Promise<User | null>;
  findMany(options?: FindManyOptions<User>): Promise<User[]>;
  findByEmail(email: string): Promise<User | null>;
  /**
   * Lookup by emailVerificationToken with addSelect for the `select: false`
   * column. Returns the full User entity (token included) so the caller can
   * inspect/clear it.
   */
  findByVerificationToken(token: string): Promise<User | null>;
  /**
   * Search users by name/email ILIKE term, optionally excluding members of a
   * specific project. Returns slim rows for autocomplete.
   */
  searchUsers(
    term: string,
    excludeProjectId?: string,
    organizationId?: string,
  ): Promise<UserSearchRow[]>;
  /** Aggregated user list with project memberships, scoped to organization. */
  findAllWithMemberships(
    organizationId?: string,
  ): Promise<UserWithMemberships[]>;
  /** Users with NO project membership, scoped to organization. */
  findUnassigned(organizationId?: string): Promise<UserSearchRow[]>;
  count(where?: FindOptionsWhere<User>): Promise<number>;
  exists(where: FindOptionsWhere<User>): Promise<boolean>;
}

export interface IUserWriter {
  create(data: DeepPartial<User>): User;
  save(data: DeepPartial<User>, options?: SaveOptions): Promise<User>;
  saveMany(data: DeepPartial<User>[], options?: SaveOptions): Promise<User[]>;
  update(id: string, patch: QueryDeepPartialEntity<User>): Promise<void>;
  remove(entity: User): Promise<User>;
}

// =============================================================================
// Board
// =============================================================================
// =============================================================================
// IssueLink (Tier-1 as of Step 2 — issue-link sub-aggregate)
// =============================================================================

export interface IIssueLinkReader {
  findById(id: string): Promise<IssueLink | null>;
  findOne(options: FindOneOptions<IssueLink>): Promise<IssueLink | null>;
  findMany(options?: FindManyOptions<IssueLink>): Promise<IssueLink[]>;
  /** Links where the issue is EITHER source OR target (both relations loaded). */
  findForIssue(issueId: string): Promise<IssueLink[]>;
  count(where?: FindOptionsWhere<IssueLink>): Promise<number>;
  exists(where: FindOptionsWhere<IssueLink>): Promise<boolean>;
}

export interface IIssueLinkWriter {
  create(data: DeepPartial<IssueLink>): IssueLink;
  save(data: DeepPartial<IssueLink>, options?: SaveOptions): Promise<IssueLink>;
  saveMany(
    data: DeepPartial<IssueLink>[],
    options?: SaveOptions,
  ): Promise<IssueLink[]>;
  remove(entity: IssueLink): Promise<IssueLink>;
}

export interface IBoardReader {
  findById(id: string): Promise<Board | null>;
  findOne(options: FindOneOptions<Board>): Promise<Board | null>;
  findMany(options?: FindManyOptions<Board>): Promise<Board[]>;
  findByProject(
    projectId: string,
    options?: FindManyOptions<Board>,
  ): Promise<Board[]>;
  /**
   * Canonical board-read with columns + project eagerly loaded.
   *
   * Encapsulates the relation-loading pattern duplicated at
   * `boards.service.ts:194` and `:259`. Filters on `projectId` so a board id
   * leaked across tenants cannot bypass tenant isolation when paired with the
   * org-level `Project.organizationId` check the caller performs.
   *
   * `relations: ['columns', 'project']` is intentional — `project` is needed
   * by the caller for the org tenant check; loading it here saves a second
   * round-trip and keeps the org check at a single call site in the service.
   */
  findScopedWithColumnsAndProject(
    projectId: string,
    boardId: string,
  ): Promise<Board | null>;
  count(where?: FindOptionsWhere<Board>): Promise<number>;
  exists(where: FindOptionsWhere<Board>): Promise<boolean>;
}

export interface IBoardWriter {
  create(data: DeepPartial<Board>): Board;
  save(data: DeepPartial<Board>, options?: SaveOptions): Promise<Board>;
  saveMany(data: DeepPartial<Board>[], options?: SaveOptions): Promise<Board[]>;
  update(id: string, patch: QueryDeepPartialEntity<Board>): Promise<void>;
  remove(entity: Board): Promise<Board>;
}

// =============================================================================
// BoardColumn (Tier-1 in Step 2 — promoted from the legacy
// `@InjectRepository(BoardColumn)` injection that violated DIP)
// =============================================================================
export interface IBoardColumnReader {
  findById(id: string): Promise<BoardColumn | null>;
  findOne(options: FindOneOptions<BoardColumn>): Promise<BoardColumn | null>;
  findMany(options?: FindManyOptions<BoardColumn>): Promise<BoardColumn[]>;
  /** All columns belonging to a single board, ordered left-to-right. */
  findByBoard(boardId: string): Promise<BoardColumn[]>;
  /**
   * Lookup a single column scoped by `(boardId, columnId)`.
   *
   * The board filter is mandatory — without it a malicious caller with a
   * column id from a different board could read/update it. Returns `null`
   * when no row matches (caller raises NotFound).
   */
  findOneByBoard(
    boardId: string,
    columnId: string,
  ): Promise<BoardColumn | null>;
  count(where?: FindOptionsWhere<BoardColumn>): Promise<number>;
  exists(where: FindOptionsWhere<BoardColumn>): Promise<boolean>;
}

export interface IBoardColumnWriter {
  create(data: DeepPartial<BoardColumn>): BoardColumn;
  save(
    data: DeepPartial<BoardColumn>,
    options?: SaveOptions,
  ): Promise<BoardColumn>;
  saveMany(
    data: DeepPartial<BoardColumn>[],
    options?: SaveOptions,
  ): Promise<BoardColumn[]>;
  update(id: string, patch: QueryDeepPartialEntity<BoardColumn>): Promise<void>;
  remove(entity: BoardColumn): Promise<BoardColumn>;
  /**
   * Bulk-reorder the columns of a single board.
   *
   * Encapsulates the parameterized VALUES-based UPDATE that previously lived
   * inline at `boards.service.ts:587`. Filters on `boardId` so cross-board
   * writes are impossible even with a malicious orderedColumnIds list.
   *
   * @param boardId            Tenant scope — REQUIRED. Filtered in WHERE.
   * @param orderedColumnIds   Columns in their target order. `[]` is a no-op.
   *                           Implementations MUST cap the length (today: 5000)
   *                           to stay under PostgreSQL's 65k parameter limit.
   */
  bulkReorder(
    boardId: string,
    orderedColumnIds: readonly string[],
  ): Promise<void>;
}

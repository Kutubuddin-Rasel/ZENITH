/**
 * Issues Module — Abstract Contracts (ISP Surface)
 *
 * These interfaces are the ONLY allowed coupling point between the
 * issues module and the rest of Zenith (Level 3 aggregate that owns
 * the atomic unit of work: issue lifecycle, workflow transitions,
 * assignments, links, labels, time-tracking, and real-time board
 * broadcasting). Concrete services, the persistence entities
 * (`Issue`, `IssueLink`, `WorkLog`), the controllers, the gateway,
 * and the HTTP DTOs are implementation details that must never leak
 * across the module boundary.
 *
 * DTO Strategy
 * ------------
 * `IssueView`, `SlimIssueView`, `IssueLinkView`, and `WorkLogView`
 * are pure value-object views — they intentionally do NOT extend the
 * TypeORM entities, so consumers cannot accidentally depend on ORM
 * metadata, lifecycle decorators, lazy relations
 * (`Issue.project` / `Issue.assignee` / `WorkLog.user`), or the
 * cross-aggregate references those relations drag in.
 *
 * Each view is designed as a **structural subset** of the
 * corresponding entity: TypeScript's covariance lets the existing
 * `IssuesService` (which returns `Promise<Issue>` / `Promise<Issue &
 * { key }>`) and `WorkLogsService` (which returns `Promise<WorkLog>`)
 * satisfy the interface methods without a single body change in
 * Step 1 — `tsc` is the proof. Step 3 narrows the new CQRS services
 * to return view DTOs directly via `mappers/issue.mapper.ts`.
 *
 * Segregation Rationale (ISP)
 * ---------------------------
 *  - `IIssueQuery` / `IIssueCommand` split keeps read-heavy consumers
 *    (dashboard, sprints, releases, integrations) decoupled from
 *    mutating capabilities.
 *  - `IIssueTransition` is isolated because status changes carry the
 *    state-machine + ACID obligations (audit history, sprint-removal
 *    on close, after-commit event dispatch) that plain field updates
 *    do not. Different downstream contract, different testing surface.
 *  - `IIssueAssignment` is segregated as the membership-validated
 *    assignee surface. It is NOT yet realised on the god class
 *    (assignment is currently folded inside `create()` / `update()`);
 *    Step 3 extracts `IssueAssignmentService` to satisfy it.
 *  - `IIssueLinkCommand` / `IIssueImport` are sub-aggregate write
 *    surfaces with distinct repositories and transaction shapes.
 *  - Time-tracking is split into `IWorkLogQuery` / `IWorkLogCommand`
 *    (read rollups vs. mutations), `ITimer` (Redis-backed running
 *    timer), and `IBillableTime` (billing aggregation).
 *
 * The repository contracts (`IssueRepository`, `WorkLogRepository`,
 * and `IssueLinkRepository` once Step 2 promotes it to Tier-1) live
 * under `backend/src/database/repositories/` because the persistence
 * boundary is shared infrastructure — bound inside `DatabaseModule`
 * and consumed via the abstract class, never via
 * `@InjectRepository(...)` (see `SOLID_STANDARDS.md` DIP rubric,
 * severity CRITICAL).
 */

import type { EntityManager } from 'typeorm';
import type { CreateIssueDto } from '../dto/create-issue.dto';
import type { UpdateIssueDto } from '../dto/update-issue.dto';
import type { MoveIssueDto } from '../dto/move-issue.dto';
import type { IssueMetadata } from '../dto/issue-metadata.dto';
import type {
  IssuePriority,
  IssueStatus,
  IssueType,
} from '../entities/issue.entity';
import type { LinkType } from '../entities/issue-link.entity';
import type { TimeAggregationResult } from '../dto/time-aggregation-result.interface';
import type {
  ActiveTimerPayload,
  BillingSummary,
  TimerStatus,
} from '../dto/timer.interface';

// ===========================================================================
// Value-Object Views (DTOs) — zero TypeORM coupling
// ===========================================================================

/**
 * Full read projection of an issue row. Structural subset of `Issue`
 * (every field below is present on the entity with an assignable
 * type), so the legacy service can return `Promise<Issue>` and still
 * satisfy `Promise<IssueView>`. Excludes relation objects
 * (`project`, `parent`, `children`, `assignee`, `reporter`,
 * `workflowStatus`) and ORM-internal columns (`embedding`,
 * `searchVector`).
 *
 * `key?` is optional because only `create()` returns `Issue & { key }`
 * — every other read path returns a plain `Issue` without it.
 */
export interface IssueView {
  readonly id: string;
  readonly number: number | null;
  readonly projectId: string;
  readonly parentId?: string;
  readonly title: string;
  readonly description?: string;
  readonly statusId: string;
  readonly status: string;
  readonly priority: IssuePriority;
  readonly assigneeId?: string | null;
  readonly reporterId: string | null;
  readonly type: IssueType;
  readonly storyPoints: number;
  readonly backlogOrder: number;
  readonly lexorank: string;
  readonly isArchived: boolean;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly dueDate: Date | null;
  readonly labels: string[];
  readonly metadata: IssueMetadata;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly key?: string;
}

/**
 * Minimal Kanban-card projection of an issue. Used by board broadcast
 * payloads and any read path that only needs the card face. Also a
 * structural subset of `Issue`.
 */
export interface SlimIssueView {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly statusId: string;
  readonly priority: IssuePriority;
  readonly type: IssueType;
  readonly assigneeId?: string | null;
  readonly storyPoints: number;
  readonly backlogOrder: number;
  readonly lexorank: string;
  readonly labels: string[];
  readonly key?: string;
}

/**
 * Pure projection of an `IssueLink` row. Excludes the
 * `sourceIssue` / `targetIssue` back-pointer relations (cross-row
 * ORM leakage).
 */
export interface IssueLinkView {
  readonly id: string;
  readonly sourceIssueId: string;
  readonly targetIssueId: string;
  readonly type: LinkType;
  readonly createdAt: Date;
}

/**
 * Pure projection of a `WorkLog` row. Excludes the `project` /
 * `issue` / `user` relations. `hourlyRate` is the DB decimal-as-string
 * (`string | null`) — honest about persistence and assignable from the
 * entity.
 */
export interface WorkLogView {
  readonly id: string;
  readonly projectId: string;
  readonly issueId: string;
  readonly userId: string;
  readonly minutesSpent: number;
  readonly note?: string;
  readonly billable: boolean;
  readonly hourlyRate: string | null;
  readonly createdAt: Date;
}

/** Acknowledgement returned by work-log deletions. */
export interface WorkLogMutationAck {
  readonly message: string;
}

/** Result of a CSV bulk import. */
export interface IssueImportResult {
  readonly created: number;
  readonly failed: number;
  readonly errors: string[];
}

/** Optional filter bag accepted by the list endpoint. */
export interface IssueFilter {
  status?: IssueStatus;
  assigneeId?: string;
  search?: string;
  label?: string;
  sprint?: string;
  sort?: string;
  includeArchived?: boolean;
  type?: string;
}

/** Scope accepted by the billable-time aggregator. */
export interface BillableScopeInput {
  issueId?: string;
  projectId?: string;
  currency?: string;
}

// ===========================================================================
// Read Surfaces
// ===========================================================================

/**
 * Issue read surface. Every implementation MUST enforce the caller's
 * project membership BEFORE returning data (read-side tenant
 * isolation lives here, not on a guard, because some queries cross
 * project boundaries).
 */
export interface IIssueQuery {
  /** List issues for a project, optionally filtered/sorted. */
  findAll(
    projectId: string,
    userId: string,
    filters?: IssueFilter,
  ): Promise<readonly IssueView[]>;

  /** Resolve a single issue. Throws `NotFoundException` when absent or out of tenant. */
  findOne(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<IssueView>;

  /** List the links anchored on an issue (both directions). */
  getLinks(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<readonly IssueLinkView[]>;

  /** Stream every issue in a project as a CSV-export readable. */
  getIssuesStream(
    projectId: string,
    userId: string,
    organizationId?: string,
  ): Promise<NodeJS.ReadableStream>;
}

// ===========================================================================
// Write Surfaces
// ===========================================================================

/**
 * Issue lifecycle write surface (field-level mutations). Status
 * changes do NOT live here — they carry state-machine + ACID
 * obligations and belong to `IIssueTransition`.
 */
export interface IIssueCommand {
  create(
    projectId: string,
    reporterId: string,
    dto: CreateIssueDto,
  ): Promise<IssueView>;

  update(
    projectId: string,
    issueId: string,
    userId: string,
    dto: UpdateIssueDto,
    organizationId?: string,
  ): Promise<IssueView>;

  archive(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<IssueView>;

  unarchive(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<IssueView>;

  remove(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void>;

  updateLabels(
    projectId: string,
    issueId: string,
    labels: string[],
    userId: string,
  ): Promise<IssueView>;
}

/**
 * Issue state-machine surface. Every implementation MUST run the
 * status write + audit-history append + sprint-removal-on-close inside
 * a single `dataSource.transaction()`, and dispatch domain events
 * only AFTER the commit succeeds (the Step 3 correctness fix for the
 * current event-before-commit / non-transactional `updateStatus`).
 */
export interface IIssueTransition {
  /**
   * Apply a status transition. When a caller supplies `manager`
   * (EntityManager Passthrough), the status write JOINS that caller's
   * `dataSource.transaction` instead of opening its own — letting a
   * cross-aggregate operation (e.g. sprint add/remove/rollover) commit
   * the issue mutation atomically with its own writes. When omitted the
   * method opens its own transaction (every existing caller is
   * unchanged — the parameter is additive and backward-compatible).
   */
  updateStatus(
    projectId: string,
    issueId: string,
    status: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<IssueView>;

  moveIssue(
    projectId: string,
    issueId: string,
    userId: string,
    dto: MoveIssueDto,
  ): Promise<IssueView>;
}

/**
 * Issue backlog-ranking surface — the SINGLE WRITER of the
 * `Issue.backlogOrder` column.
 *
 * The backlog module owns no rows; it derives its ordered queue from the
 * `Issue` aggregate. To preserve the single-writer invariant (only the
 * Issue aggregate mutates `issues` rows), the backlog delegates every
 * ordering write to this surface instead of holding a raw
 * `Repository<Issue>`. Both methods scope every write by `projectId`.
 *
 * Every implementation MUST perform its multi-row renumber inside a single
 * `dataSource.transaction()` so a partial failure cannot leave the backlog
 * half-renumbered (the ACID fix for the legacy non-transactional
 * `save(all)`), and MUST use parameterised SQL (the fix for the legacy
 * string-interpolated `CASE` bulk update).
 */
export interface IIssueRanking {
  /**
   * Apply an explicit ordering to the given issue IDs, writing each row's
   * `backlogOrder` to its index in the array. When a caller supplies
   * `manager` (EntityManager Passthrough), the writes JOIN that caller's
   * `dataSource.transaction` instead of opening their own — letting a
   * cross-aggregate operation commit the ranking atomically with its own
   * writes. When omitted the method opens its own transaction (additive and
   * backward-compatible). A parameterised bulk update; never interpolates
   * IDs into SQL.
   */
  reorderBacklog(
    projectId: string,
    issueIds: string[],
    manager?: EntityManager,
  ): Promise<void>;

  /**
   * Move a single backlog issue to `newPosition`, renumbering the affected
   * slice, and return the reordered backlog as `IssueView[]`. Runs the
   * fetch-splice-renumber-persist cycle inside one transaction (joining the
   * caller's `manager` when supplied).
   */
  moveBacklogItem(
    projectId: string,
    issueId: string,
    newPosition: number,
    manager?: EntityManager,
  ): Promise<IssueView[]>;
}

/**
 * Membership-validated assignee surface.
 *
 * NOTE (Step 1): this contract describes the FUTURE
 * `IssueAssignmentService` extracted in Step 3. The legacy
 * `IssuesService` does NOT implement it — assignment is currently
 * folded inside `create()` / `update()`. `ISSUE_ASSIGNMENT_TOKEN`
 * binds `useExisting: IssuesService` purely so the token is
 * resolvable; no consumer injects this surface until Step 4.
 */
export interface IIssueAssignment {
  /** Throw unless `assigneeId` is an active member of the project. */
  validateAssignee(projectId: string, assigneeId: string): Promise<void>;

  /** Set the assignee (validates membership), emit assignment event. */
  setAssignee(
    projectId: string,
    issueId: string,
    assigneeId: string,
    userId: string,
  ): Promise<IssueView>;

  /** Clear the assignee, emit unassignment event. */
  clearAssignee(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<IssueView>;
}

/** Issue-link sub-aggregate write surface. */
export interface IIssueLinkCommand {
  addLink(
    projectId: string,
    sourceIssueId: string,
    targetIssueId: string,
    type: LinkType,
    userId: string,
  ): Promise<IssueLinkView>;

  removeLink(projectId: string, linkId: string, userId: string): Promise<void>;
}

/** Bulk CSV import surface. */
export interface IIssueImport {
  importIssues(
    projectId: string,
    fileBuffer: Buffer,
    userId: string,
    organizationId?: string,
  ): Promise<IssueImportResult>;
}

// ===========================================================================
// Time-Tracking Surfaces
// ===========================================================================

/** Work-log read + aggregation surface. */
export interface IWorkLogQuery {
  listWorkLogs(
    projectId: string,
    issueId: string,
  ): Promise<readonly WorkLogView[]>;
  getTotalTimeByIssue(issueId: string): Promise<TimeAggregationResult>;
  getTotalTimeByProject(projectId: string): Promise<TimeAggregationResult>;
  getTotalTimeByUser(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TimeAggregationResult>;
  getTotalTimeBySprint(sprintId: string): Promise<TimeAggregationResult>;
}

/** Work-log mutation surface (role-gated: owner or PROJECT_LEAD). */
export interface IWorkLogCommand {
  addWorkLog(
    projectId: string,
    issueId: string,
    userId: string,
    minutesSpent: number,
    note?: string,
    billable?: boolean,
    hourlyRate?: number,
  ): Promise<WorkLogView>;

  updateWorkLog(
    projectId: string,
    issueId: string,
    workLogId: string,
    userId: string,
    minutesSpent?: number,
    note?: string,
  ): Promise<WorkLogView>;

  deleteWorkLog(
    projectId: string,
    issueId: string,
    workLogId: string,
    userId: string,
  ): Promise<WorkLogMutationAck>;
}

/** Redis-backed running-timer surface (one active timer per user). */
export interface ITimer {
  start(
    userId: string,
    projectId: string,
    issueId: string,
  ): Promise<ActiveTimerPayload>;
  stop(
    userId: string,
    options: { note?: string; billable?: boolean; hourlyRate?: number },
  ): Promise<WorkLogView>;
  status(userId: string): Promise<TimerStatus | null>;
}

/** Billing aggregation surface. */
export interface IBillableTime {
  calculateBillableAmount(scope: BillableScopeInput): Promise<BillingSummary>;
}

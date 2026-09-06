/**
 * Sprints Module — ISP-Segregated Service Contracts & View Projections
 *
 * Role-based interfaces (one per `SPRINT_*_TOKEN`) split the legacy
 * 869-line `SprintsService` god class along its real seams: query,
 * command, lifecycle, membership, metrics, and system snapshots. No
 * consumer should depend on a method it does not call (ISP).
 *
 * View projections (`SprintView`, `SprintIssueView`,
 * `SprintSnapshotView`) are *structural subsets* of their entities —
 * they drop the ORM relation back-pointers (`Sprint.project`,
 * `Sprint.issues`, `SprintIssue.sprint/issue`, `SprintSnapshot.sprint`)
 * so the sealed barrel never leaks the persistence graph. Because the
 * entity has every field the view declares (plus the relations), the
 * concrete entity remains assignable to its view — the decomposed
 * services can `implements` these contracts and return the raw entity
 * unchanged.
 *
 * The foreign `Issue` aggregate is projected through the issues
 * module's own public `IssueView`, imported from its sealed barrel —
 * never the `Issue` entity directly.
 */

import { SprintStatus } from '../entities/sprint.entity';
import { CreateSprintDto } from '../dto/create-sprint.dto';
import { UpdateSprintDto } from '../dto/update-sprint.dto';
import { AddIssueToSprintDto } from '../dto/add-issue.dto';
import { RemoveIssueFromSprintDto } from '../dto/remove-issue.dto';
import {
  VelocityResponseDto,
  BurndownResponseDto,
  BurnupResponseDto,
} from '../dto/sprint-metrics.dto';
import { IssueView } from '../../issues';

// ===========================================================================
// View Projections (pure, relation-free; structural subsets of entities)
// ===========================================================================

/**
 * Pure projection of a `Sprint` row. Excludes the `project` relation
 * (cross-aggregate leakage) and the `issues` join collection (use
 * `ISprintQuery.getSprintIssues` for the membership face).
 */
export interface SprintView {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: SprintStatus;
  readonly isActive: boolean;
  readonly goal?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Pure projection of a `SprintIssue` join row. Excludes the `sprint`
 * and `issue` relation back-pointers.
 */
export interface SprintIssueView {
  readonly id: string;
  readonly sprintId: string;
  readonly issueId: string;
  readonly sprintOrder: number;
}

/**
 * Pure projection of a `SprintSnapshot` row. Excludes the `sprint`
 * relation. Drives burndown/burnup reconstruction.
 */
export interface SprintSnapshotView {
  readonly id: string;
  readonly sprintId: string;
  readonly date: string;
  readonly totalPoints: number;
  readonly completedPoints: number;
  readonly remainingPoints: number;
  readonly totalIssues: number;
  readonly completedIssues: number;
  readonly createdAt: Date;
}

// ===========================================================================
// Read Surface
// ===========================================================================

/**
 * Sprint read surface. Every implementation MUST enforce the caller's
 * project membership BEFORE returning data (read-side tenant isolation
 * lives here, not on a guard).
 */
export interface ISprintQuery {
  /** List sprints for a project; `active` filters to the running sprint. */
  findAll(
    projectId: string,
    userId: string,
    active?: boolean,
  ): Promise<readonly SprintView[]>;

  /** Resolve a single sprint. Throws `NotFoundException` when absent or out of tenant. */
  findOne(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<SprintView>;

  /** Ordered issues currently committed to a sprint (issue-domain projection). */
  getSprintIssues(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<readonly IssueView[]>;

  /** Daily snapshots for a sprint, ascending by date. */
  getSprintSnapshots(sprintId: string): Promise<readonly SprintSnapshotView[]>;
}

// ===========================================================================
// Write Surfaces
// ===========================================================================

/**
 * Sprint command surface — CRUD plus the `PLANNED → ACTIVE` start
 * transition. Mutations enforce `PROJECT_LEAD` authority.
 */
export interface ISprintCommand {
  /** Create a sprint; auto-provisions a board when created `ACTIVE`. */
  create(
    projectId: string,
    userId: string,
    dto: CreateSprintDto,
  ): Promise<SprintView>;

  /** Patch sprint metadata. */
  update(
    projectId: string,
    sprintId: string,
    userId: string,
    dto: UpdateSprintDto,
  ): Promise<SprintView>;

  /** Hard-delete a sprint. */
  remove(projectId: string, sprintId: string, userId: string): Promise<void>;

  /** Transition a `PLANNED` sprint to `ACTIVE`. */
  startSprint(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<SprintView>;
}

/**
 * Sprint lifecycle surface — sprint completion ("archive") with issue
 * rollover. Step 3 makes this a single ACID transaction via the
 * EntityManager-Passthrough pattern into `ISSUE_COMMAND_TOKEN`.
 */
export interface ISprintLifecycle {
  /**
   * Complete a sprint, rolling unfinished issues into `nextSprintId`
   * (or back to the backlog when omitted).
   */
  archive(
    projectId: string,
    sprintId: string,
    userId: string,
    nextSprintId?: string,
  ): Promise<SprintView>;
}

/**
 * Sprint membership surface — add/remove issues. Step 3 routes the
 * foreign `Issue.status` mutation through `ISSUE_TRANSITION_TOKEN` on
 * the sprint's own `EntityManager` (no boundary leak).
 */
export interface ISprintMembership {
  /** Commit an issue to a sprint. */
  addIssue(
    projectId: string,
    sprintId: string,
    userId: string,
    dto: AddIssueToSprintDto,
  ): Promise<SprintIssueView>;

  /** Drop an issue from a sprint. */
  removeIssue(
    projectId: string,
    sprintId: string,
    userId: string,
    dto: RemoveIssueFromSprintDto,
  ): Promise<void>;
}

// ===========================================================================
// Analytics Surface (read-heavy — "Prep for ClickHouse" isolation)
// ===========================================================================

/**
 * Sprint analytics surface. Currently reads Postgres `SprintSnapshot`
 * rows; isolated behind its own token so the read backend can be
 * swapped to ClickHouse in the Level-5 Data/ML phase without touching
 * core business logic.
 */
export interface ISprintMetrics {
  /** Trailing velocity + trend across recent sprints. */
  getVelocity(projectId: string, userId: string): Promise<VelocityResponseDto>;

  /** Burndown series (remaining work vs ideal slope). */
  getBurndown(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<BurndownResponseDto>;

  /** Burnup series (completed work vs total scope, incl. scope creep). */
  getBurnup(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<BurnupResponseDto>;
}

// ===========================================================================
// System Snapshot Surface (tenant-bypassing background tasks / cron)
// ===========================================================================

/**
 * System-level snapshot surface consumed by `SprintsCron`. Replaces the
 * legacy `findAllActiveSystemWide_UNSAFE` smell with an explicitly named
 * background-task contract.
 */
export interface ISprintSnapshot {
  /** Persist today's burndown/burnup snapshot for a sprint. */
  captureSnapshot(sprintId: string): Promise<void>;

  /**
   * @internal background-only — bypasses tenant isolation. Returns every
   * ACTIVE sprint across ALL tenants for cron snapshot generation. MUST
   * NOT be reached from any user-facing path.
   */
  findAllActiveSystemWide(): Promise<readonly SprintView[]>;
}

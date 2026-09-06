/**
 * Sprints Module — Abstract Repository (DIP Boundary, Step 2)
 *
 * The ONLY allowed persistence contract for the `Sprint` aggregate
 * root and its `SprintIssue` child (the join table is part of the
 * sprint aggregate, so it lives behind the same repository). Concrete
 * implementations (`PostgresSprintRepository`) own
 * `@InjectRepository(Sprint)` / `@InjectRepository(SprintIssue)`
 * exclusively — no service, controller, or cron may inject the TypeORM
 * repositories directly.
 *
 * Abstract-class-as-DI-token: NestJS resolves this binding by
 * reference identity on the class symbol, mirroring
 * `AbstractApiKeyRepository` / `AbstractProjectMemberRepository`. There
 * is therefore NO `SPRINT_REPOSITORY_TOKEN` in `sprints.tokens.ts` —
 * the abstract class itself IS the token.
 *
 * Return-type policy
 * ------------------
 * Methods return the raw `Sprint` / `SprintIssue` entities (not the
 * `SprintView` projections). Step 2 is a structural pivot only — the
 * legacy `SprintsService` still mutates entity fields directly
 * (`sprint.status = COMPLETED`, `sprint.isActive = false`) and reads
 * the joined `issue` relation. Step 3's decomposed CQRS services
 * project to the sealed `SprintView` / `SprintIssueView` DTOs at the
 * read boundary.
 *
 * Transaction policy (EntityManager Passthrough)
 * ----------------------------------------------
 * Every write accepts an optional trailing `manager?: EntityManager`.
 * When provided, the impl MUST execute through `manager.getRepository`
 * so the write joins the caller's `dataSource.transaction`; when
 * omitted, it falls back to its own injected repository (legacy /
 * non-transactional callers stay binary-compatible). Step 3's
 * `SprintMembershipService` / `SprintLifecycleService` open the
 * `dataSource.transaction` and thread `manager` through these methods
 * (the `project-command.service.ts` shape) — replacing the legacy
 * `this.siRepo.manager.transaction(...)`.
 */

import type { EntityManager } from 'typeorm';
import type { Sprint } from '../../entities/sprint.entity';
import type { SprintIssue } from '../../entities/sprint-issue.entity';

/**
 * Raw aggregation row produced by `aggregateSprintStats` (a
 * `getRawOne` over `sprint_issues ⋈ issues`). Postgres returns
 * `COUNT`/`SUM` as strings, so fields are `string | number`; the
 * snapshot writer coerces with `Number(... || 0)`.
 */
export interface SprintStatsRow {
  totalIssues: string | number;
  totalPoints: string | number;
  completedPoints: string | number;
  completedIssues: string | number;
}

export abstract class AbstractSprintRepository {
  // ---------------------------------------------------------------------------
  // Sprint reads
  // ---------------------------------------------------------------------------

  /**
   * Resolve a sprint by primary key with NO tenant/project scoping.
   * System-level read used by the snapshot cron path
   * (`captureSnapshot`). Returns `null` when absent.
   */
  abstract findById(sprintId: string): Promise<Sprint | null>;

  /**
   * Resolve a single sprint within a project, eager-loading
   * `issues`, `issues.issue`, and `project` — the relation set the
   * legacy `findOne` returned to every detail consumer.
   */
  abstract findDetailById(
    projectId: string,
    sprintId: string,
  ): Promise<Sprint | null>;

  /**
   * List sprints for a project. When `activeOnly` is true, narrows to
   * the running sprint (`isActive = true AND status = ACTIVE`).
   */
  abstract findAllInProject(
    projectId: string,
    activeOnly?: boolean,
  ): Promise<Sprint[]>;

  /**
   * Resolve a sprint by `(id, projectId)` that is currently
   * `isActive = true`. Used by `archive` to validate the rollover
   * target sprint.
   */
  abstract findActiveInProject(
    projectId: string,
    sprintId: string,
  ): Promise<Sprint | null>;

  /**
   * The most recently-ended COMPLETED sprints for a project
   * (newest-first, capped at `limit`). Feeds the velocity series.
   */
  abstract findRecentCompleted(
    projectId: string,
    limit: number,
  ): Promise<Sprint[]>;

  /**
   * @internal background-only — bypasses tenant isolation. Every
   * ACTIVE + `isActive` sprint across ALL tenants, for the daily
   * snapshot cron. MUST NOT be reached from any user-facing path.
   */
  abstract findAllActiveSystemWide(): Promise<Sprint[]>;

  // ---------------------------------------------------------------------------
  // SprintIssue (join) reads
  // ---------------------------------------------------------------------------

  /** Resolve a single membership row by `(sprintId, issueId)`. */
  abstract findSprintIssue(
    sprintId: string,
    issueId: string,
  ): Promise<SprintIssue | null>;

  /**
   * Every membership row for a sprint, eager-loading `issue` (so the
   * caller can inspect `issue.status` for rollover). Unordered.
   */
  abstract findSprintIssuesWithIssue(sprintId: string): Promise<SprintIssue[]>;

  /**
   * Every membership row for a sprint, eager-loading `issue`, ordered
   * by `sprintOrder ASC` — the board/backlog ordering.
   */
  abstract findSprintIssuesOrdered(sprintId: string): Promise<SprintIssue[]>;

  /**
   * DB-side aggregation of a sprint's scope/burn stats from
   * `sprint_issues ⋈ issues`. Returns `null` when the sprint has no
   * issues. Used by `captureSnapshot` to avoid loading every issue.
   */
  abstract aggregateSprintStats(
    sprintId: string,
  ): Promise<SprintStatsRow | null>;

  // ---------------------------------------------------------------------------
  // Sprint writes
  // ---------------------------------------------------------------------------

  /**
   * Build a non-persisted `Sprint` from a partial payload (mirrors
   * `Repository<Sprint>.create`). No DB access, so no `manager`.
   */
  abstract createEntity(data: Partial<Sprint>): Sprint;

  /** Insert-or-update a sprint by primary key. @see Transaction policy. */
  abstract save(sprint: Sprint, manager?: EntityManager): Promise<Sprint>;

  /** Hard-delete a sprint. @see Transaction policy. */
  abstract remove(sprint: Sprint, manager?: EntityManager): Promise<void>;

  // ---------------------------------------------------------------------------
  // SprintIssue (join) writes
  // ---------------------------------------------------------------------------

  /**
   * Create + persist a membership row. Returns the persisted entity.
   * @see Transaction policy.
   */
  abstract createSprintIssue(
    data: { sprintId: string; issueId: string; sprintOrder: number },
    manager?: EntityManager,
  ): Promise<SprintIssue>;

  /**
   * Re-point a batch of membership rows (by primary key) to a new
   * sprint — the bulk rollover-to-next-sprint write. @see Transaction
   * policy.
   */
  abstract moveIssuesToSprint(
    sprintIssueIds: string[],
    targetSprintId: string,
    manager?: EntityManager,
  ): Promise<void>;

  /** Remove a single membership row. @see Transaction policy. */
  abstract removeSprintIssue(
    sprintIssue: SprintIssue,
    manager?: EntityManager,
  ): Promise<void>;

  /**
   * Remove a batch of membership rows — the rollover-to-backlog
   * write. @see Transaction policy.
   */
  abstract removeSprintIssues(
    sprintIssues: SprintIssue[],
    manager?: EntityManager,
  ): Promise<void>;
}

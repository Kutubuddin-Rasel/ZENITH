/**
 * Analytics Module — Abstract Contracts (ISP Surface)
 *
 * These interfaces are the ONLY allowed coupling point into the analytics
 * module (Level 3 — Communication & Observability: cycle-time, sprint-risk,
 * stalled-issue detection, historical-trend reporting). Concrete services,
 * the `ProjectMetrics` persistence entity, the controller, the cron
 * scheduler, and the `AnalyticsModule` class itself are implementation
 * details that must never leak across the module boundary.
 *
 * Two contract families live here:
 *
 *  1. Inbound service surfaces — `ICycleTimeQuery`, `ISprintRiskQuery`,
 *     `IHistoricalMetricsQuery`, `IStalledIssuesQuery` (reads, consumed by
 *     `AnalyticsController`) and `IAnalyticsAggregationJob` (the two `@Cron`
 *     aggregation jobs). Signatures are lifted verbatim from the existing
 *     `CycleTimeService` / `SprintRiskService` / `HistoricalMetricsService` /
 *     `AnalyticsJobsService` so the Step-1 `useExisting` strangler bindings
 *     type-check against the live classes with zero body changes.
 *
 *  2. Outbound ports — `IAnalyticsReadModel` (the live OLTP `issues` /
 *     `projects` read surface) and `IProjectMetricsRepository` (the
 *     pre-aggregated rollup). These are deliberately DIALECT-FREE: no
 *     Postgres `INTERVAL` / `EXTRACT` / `tenantJoin()` leaks into the
 *     signatures, so Step 2's `Postgres*` implementations can be swapped
 *     for a future `ClickHouse*` impl (the planned OLAP migration) without
 *     touching any query/calculator/job service. Mirrors the sprints
 *     "Prep-for-ClickHouse" isolation directive.
 *
 * DTO Strategy
 * ------------
 * The result/view types below are pure value objects — they intentionally
 * do NOT extend the `ProjectMetrics` TypeORM entity, so consumers cannot
 * depend on ORM metadata or lifecycle decorators. `MetricType` and
 * `IPercentiles` are imported from the entity module because they are pure
 * domain value types (an enum and a JSONB schema), part of the public
 * contract surface — never the entity class itself.
 */

import type {
  MetricType,
  IPercentiles,
} from '../entities/project-metrics.entity';

// ===========================================================================
// Value-Object Views (DTOs) — zero TypeORM coupling
// ===========================================================================

/** Per-issue cycle-time data point in a detailed cycle-time response. */
export interface CycleTimeMetric {
  issueId: string;
  issueTitle: string;
  cycleTimeHours: number;
  completedAt: Date;
}

/** Cycle-time response when at least one 'Done' issue is in the window. */
export interface CycleTimeSummaryResult {
  averageDays: number;
  p50Days: number;
  p85Days: number;
  p95Days: number;
  totalIssues: number;
  trend: 'up' | 'down' | 'flat';
  data: CycleTimeMetric[];
}

/** Cycle-time response when the window holds no completed issues. */
export interface CycleTimeEmptyResult {
  averageDays: 0;
  trend: 'flat';
  totalIssues: 0;
  data: [];
}

/** One weighted factor contributing to a sprint-risk score. */
export interface RiskFactor {
  name: string;
  score: number; // 0-100, where 100 is high risk
  description: string;
}

/** Multi-factor sprint-risk result returned to the HTTP layer. */
export interface SprintRiskResult {
  score: number;
  level: string;
  factors: RiskFactor[];
}

/** A single time-series point from the historical-metrics rollup. */
export interface HistoricalMetricPoint {
  metricDate: string;
  value: number;
  percentiles: IPercentiles | null;
  calculatedAt: Date;
  referenceId: string | null;
}

/** Input for an idempotent rollup snapshot upsert (written by cron jobs). */
export interface PersistMetricInput {
  organizationId: string;
  projectId: string;
  metricType: MetricType;
  value: number;
  percentiles: IPercentiles | null;
  referenceId: string | null;
}

/** A stalled issue surfaced to assignees / the API (no recent activity). */
export interface StalledIssue {
  id: string;
  title: string;
  assigneeId: string | null;
  projectId: string;
  projectKey: string;
  daysSinceUpdate: number;
}

// ===========================================================================
// Outbound Port — Raw OLTP read surface (dialect-free, ClickHouse-swappable)
// ===========================================================================

/**
 * Minimal projection of an `issues` row used by cycle-time computation.
 * Owned by the read model so the calculator never speaks SQL or TypeORM.
 */
export interface CycleTimeIssueRow {
  id: string;
  title: string;
  status: string;
  updatedAt: Date;
}

/**
 * The single seam over the live OLTP `issues` / `projects` tables. Every
 * Postgres-dialect raw query currently embedded in `CycleTimeService` and
 * `AnalyticsJobsService` moves behind this port in Step 2 (`tenantJoin()`,
 * `INTERVAL`, `EXTRACT`, and string interpolation become impl details +
 * bound parameters). The interface is intentionally dialect-free so a
 * `ClickHouseAnalyticsReadRepository` can replace the Postgres impl with
 * zero changes to the calculator / query / job services.
 */
export interface IAnalyticsReadModel {
  /**
   * 'Done' issues for a project within a rolling lookback window.
   * Request-scoped: tenant isolation enforced by the implementation.
   */
  findDoneIssuesForCycleTime(
    projectId: string,
    lookbackDays: number,
  ): Promise<CycleTimeIssueRow[]>;

  /**
   * 'Done' issues completed within an explicit [start, end] window — the
   * baseline for cycle-time trend comparison.
   */
  findDoneIssuesInPeriod(
    projectId: string,
    start: Date,
    end: Date,
  ): Promise<CycleTimeIssueRow[]>;

  /**
   * Stalled issues for a single project (request-scoped tenant filter),
   * with no activity for at least `stalledAfterDays`.
   */
  findStalledIssues(
    projectId: string,
    stalledAfterDays: number,
  ): Promise<StalledIssue[]>;

  /**
   * System-wide stalled-issue scan for the daily cron. Runs OUTSIDE request
   * context (no CLS tenant id), so the implementation relies on a structural
   * soft-delete filter rather than `tenantJoin()`.
   */
  findStalledIssuesSystemWide(
    stalledAfterDays: number,
    limit: number,
  ): Promise<StalledIssue[]>;

  /**
   * Resolve a project's owning organization id — needed by cron jobs to
   * persist tenant-scoped rollup snapshots without a CLS context.
   */
  findProjectOrganizationId(projectId: string): Promise<string | null>;
}

// ===========================================================================
// Outbound Port — Pre-aggregated rollup (OLAP candidate)
// ===========================================================================

/**
 * Read/write port over the hand-rolled `ProjectMetrics` rollup table — the
 * prime ClickHouse migration candidate. Wraps the `@InjectRepository`
 * coupling currently inside `HistoricalMetricsService` so both the read
 * surface and the idempotent cron upsert flow through one swappable seam.
 */
export interface IProjectMetricsRepository {
  /** Tenant-isolated time-series read for trend charts. */
  findHistorical(
    projectId: string,
    metricType: MetricType,
    startDate: string,
    endDate: string,
    referenceId?: string,
  ): Promise<HistoricalMetricPoint[]>;

  /** Idempotent UPSERT keyed on (org, project, metricType, day). */
  upsertSnapshot(input: PersistMetricInput): Promise<void>;
}

// ===========================================================================
// Inbound Service Surfaces (ISP-segregated)
// ===========================================================================

/** Cycle-time read surface (cache + stampede coalescing live behind it). */
export interface ICycleTimeQuery {
  calculateProjectCycleTime(
    projectId: string,
    usage?: 'summary' | 'detailed',
    daysLookback?: number,
  ): Promise<CycleTimeSummaryResult | CycleTimeEmptyResult>;
}

/** Sprint-risk read surface (cache + stampede coalescing + alert dispatch). */
export interface ISprintRiskQuery {
  calculateSprintRisk(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<SprintRiskResult>;
}

/** Historical-metrics read surface backing the trend-chart endpoint. */
export interface IHistoricalMetricsQuery {
  getHistoricalMetrics(
    projectId: string,
    metricType: MetricType,
    startDate: string,
    endDate: string,
    referenceId?: string,
  ): Promise<HistoricalMetricPoint[]>;
}

/** Stalled-issues read surface backing `GET /analytics/stalled-issues`. */
export interface IStalledIssuesQuery {
  getStalledIssues(projectId: string): Promise<StalledIssue[]>;
}

/**
 * Scheduled aggregation surface — the two `@Cron` jobs. Segregated from the
 * read surfaces because it WRITES (rollup snapshots, notifications) and runs
 * outside request context; Step 3 extracts it from the read path entirely.
 */
export interface IAnalyticsAggregationJob {
  /** Daily 09:00 — detect stalled issues, notify assignees, persist stall rate. */
  detectStalledIssues(): Promise<void>;

  /** Weekdays 08:00 — score active-sprint risk, persist risk scores, snapshot. */
  calculateDailyRisks(): Promise<void>;
}

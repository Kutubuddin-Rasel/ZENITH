/**
 * Reports Module — Canonical Contracts (ISP Surface, Step 1)
 *
 * This file is the single coupling point into the reports module. It carries
 * four concern-segregated families, all deliberately TypeORM-free and
 * SQL-dialect-free so the implementations behind them stay swappable:
 *
 *  1. Unified enums — `ReportType` / `ReportFormat`. One source of truth,
 *     collapsing the three competing report-type enums and two format enums
 *     that previously drifted across `dto/`, `interfaces/scheduled-report`,
 *     and the service method names.
 *
 *  2. Canonical render view-model — `ReportTable` (+ `ReportColumn` /
 *     `ReportRow` / `ReportSection`). Produced ONCE per report by its data
 *     provider and consumed by EVERY formatter (PDF / XLSX / CSV), which
 *     eliminates the per-formatter table-rebuild duplication currently
 *     copy-pasted across `pdf-export.service` and `excel-export.service`.
 *
 *  3. ISP service surfaces — `IReportDataProvider` (one strategy per report
 *     type), `IReportFormatter` (one strategy per format), `IReportExporter`
 *     (the O(1) registry-dispatch facade), and `IReportsReadModel` (the
 *     reports-owned aggregation port — the ClickHouse-swap seam).
 *
 *  4. Domain data shapes — the per-report value objects (`VelocityDataPoint`
 *     et al.) extracted verbatim from the legacy `ReportsService` so its
 *     re-export shim stays type-identical for the formatter adapters during
 *     the strangler migration.
 *
 * ZERO `any`. Mirrors the sealed `analytics`/`sprints` contract convention.
 */

import type { PassThrough } from 'stream';

// ===========================================================================
// Unified Enums (single source of truth)
// ===========================================================================

/** Every report the module can produce. String values are stable (S3 keys,
 *  cache keys, BullMQ payloads, the `:type` route param all depend on them). */
export enum ReportType {
  VELOCITY = 'velocity',
  BURNDOWN = 'burndown',
  CUMULATIVE_FLOW = 'cumulative-flow',
  EPIC_PROGRESS = 'epic-progress',
  ISSUE_BREAKDOWN = 'issue-breakdown',
}

/** Every export format. `CSV` is wired through the streaming
 *  `CsvReportFormatter` + registry in Step 3; until then the HTTP export DTO
 *  validates only the `pdf`/`xlsx` subset so `csv` requests still 400. */
export enum ReportFormat {
  PDF = 'pdf',
  XLSX = 'xlsx',
  CSV = 'csv',
}

// ===========================================================================
// Canonical Render View-Model
// ===========================================================================

/** A printable cell value. `null` renders as the formatter's empty token. */
export type ReportCellValue = string | number | null;

/** A row keyed by `ReportColumn.key`. */
export type ReportRow = Readonly<Record<string, ReportCellValue>>;

/** A single column definition shared by all formatters. */
export interface ReportColumn {
  /** Stable key used to read the value from each `ReportRow`. */
  readonly key: string;
  /** Human-readable header rendered verbatim by every formatter. */
  readonly header: string;
  /** Render hint (alignment / formatting) — formatters may ignore it. */
  readonly kind?: 'string' | 'number' | 'percent' | 'date';
}

/** A self-contained block: one XLSX sheet / one PDF table / one CSV group. */
export interface ReportSection {
  readonly title: string;
  readonly columns: readonly ReportColumn[];
  readonly rows: readonly ReportRow[];
}

/**
 * The canonical, format-agnostic report payload. A provider builds it once;
 * each formatter renders it without re-querying or re-shaping. Single-table
 * reports use `columns`/`rows`; multi-dimensional reports (e.g. issue
 * breakdown) add `sections` → multi-sheet XLSX / multi-block PDF.
 */
export interface ReportTable {
  /** Document title (PDF header / XLSX workbook title). */
  readonly title: string;
  /** Primary columns (the default section). */
  readonly columns: readonly ReportColumn[];
  /** Primary rows (the default section). */
  readonly rows: readonly ReportRow[];
  /** Optional additional sections rendered after the primary table. */
  readonly sections?: readonly ReportSection[];
  /** Optional generation metadata surfaced in headers (project, generatedAt). */
  readonly meta?: Readonly<Record<string, string>>;
}

// ===========================================================================
// Request Context
// ===========================================================================

/**
 * Everything a provider needs to fetch a report, independent of the transport
 * (HTTP request vs. BullMQ job). `organizationId` is the tenant scope;
 * `sprintId`/`days` are the optional per-report parameters.
 */
export interface ReportRequestContext {
  readonly projectId: string;
  readonly userId: string;
  readonly organizationId?: string;
  /** Burndown: target sprint (omitted → active sprint). */
  readonly sprintId?: string;
  /** Cumulative flow: trailing window in days (default 30). */
  readonly days?: number;
}

// ===========================================================================
// ISP Service Surfaces
// ===========================================================================

/**
 * One strategy per `ReportType` (OCP). Each provider fetches + shapes exactly
 * one report into the canonical `ReportTable`. Registered multi-provider under
 * `REPORT_DATA_PROVIDER_TOKEN`; the registry keys them by `reportType`.
 */
export interface IReportDataProvider {
  readonly reportType: ReportType;
  fetch(ctx: ReportRequestContext): Promise<ReportTable>;
}

/**
 * One strategy per `ReportFormat` (OCP). Renders any `ReportTable` to a
 * streaming `PassThrough` (O(row) memory). Registered multi-provider under
 * `REPORT_FORMATTER_TOKEN`; the registry keys them by `format`.
 */
export interface IReportFormatter {
  readonly format: ReportFormat;
  render(table: ReportTable): PassThrough;
}

/**
 * The export facade — collapses the four duplicated `{type}×{format}` dispatch
 * sites into one O(1) call: `formatter(format).render(provider(type).fetch(ctx))`.
 * Bound under `REPORT_EXPORTER_TOKEN`.
 */
export interface IReportExporter {
  export(
    type: ReportType,
    format: ReportFormat,
    ctx: ReportRequestContext,
  ): Promise<PassThrough>;
}

/**
 * Reports-owned aggregation port (Step 2 impl) — the ONLY surface allowed to
 * touch the `Issue`/`SprintIssue`/`Project` tables on behalf of reports.
 * Deliberately dialect-free so the Postgres impl can be swapped for a
 * `ClickHouse*` impl behind `REPORTS_READ_MODEL_TOKEN` with zero provider
 * churn (mirrors the analytics OLAP-swap seam).
 */
export interface IReportsReadModel {
  /** Per-sprint committed/completed story-point rollup for the given sprints. */
  getVelocityPoints(
    organizationId: string,
    sprintIds: readonly string[],
  ): Promise<readonly VelocityPointsAggregate[]>;

  /** Status counts per day over a trailing window (cumulative-flow source). */
  getCumulativeFlow(
    organizationId: string,
    projectId: string,
    days: number,
  ): Promise<readonly CumulativeFlowPoint[]>;

  /** Epic roll-up with child story/point completion. */
  getEpicProgress(
    organizationId: string,
    projectId: string,
  ): Promise<readonly EpicProgressDataPoint[]>;

  /** Type/priority/status/assignee breakdown + total. */
  getIssueBreakdown(
    organizationId: string,
    projectId: string,
  ): Promise<IssueBreakdownResult>;

  /**
   * Tenant-bypassing background read for the weekly cron sweep. Analogous to
   * sprints' `findAllActiveSystemWide` — MUST NOT be reached from a
   * user-facing path. Returns the slim projection the dispatcher needs.
   */
  findActiveProjectsForScheduling(): Promise<readonly SchedulableProject[]>;
}

// ===========================================================================
// Read-Model Aggregate Shapes (port outputs)
// ===========================================================================

/** Numeric-normalized per-sprint points rollup (no DB string coercion leaks). */
export interface VelocityPointsAggregate {
  readonly sprintId: string;
  readonly committedPoints: number;
  readonly completedPoints: number;
}

/** Slim active-project projection for the cron dispatcher. */
export interface SchedulableProject {
  readonly id: string;
  readonly name: string;
  readonly organizationId: string;
}

/**
 * A cumulative-flow data point: a date plus a status→count map. The index
 * signature carries the dynamic per-status counts; `date` is the anchor.
 */
export interface CumulativeFlowPoint {
  readonly date: string;
  readonly [status: string]: number | string;
}

// ===========================================================================
// Per-Report Domain Data Shapes
// (extracted verbatim from the legacy `ReportsService`; re-exported by it for
//  the formatter adapters during the strangler — see `reports.service.ts`)
// ===========================================================================

/** Velocity row — carries `sprintStart`/`sprintEnd` and covers ALL completed
 *  sprints (the regression guard against trailing-5/no-date truncation). */
export interface VelocityDataPoint {
  sprintId: string;
  sprintName: string;
  completedPoints: number;
  committedPoints: number;
  sprintStart: Date | string;
  sprintEnd: Date | string;
}

/** Burndown row. */
export interface BurndownDataPoint {
  date: Date | string;
  remainingPoints: number;
  completedPoints: number;
  totalPoints: number;
}

/** Epic-progress row with derived completion percentages. */
export interface EpicProgressDataPoint {
  epicId: string;
  epicTitle: string;
  epicStatus: string;
  totalStories: number;
  completedStories: number;
  totalStoryPoints: number;
  completedStoryPoints: number;
  completionPercentage: number;
  storyPointsCompletionPercentage: number;
  dueDate: Date | null;
}

/** Issue-breakdown roll-up across four dimensions. */
export interface IssueBreakdownResult {
  typeBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  assigneeBreakdown: Record<string, number>;
  totalIssues: number;
}

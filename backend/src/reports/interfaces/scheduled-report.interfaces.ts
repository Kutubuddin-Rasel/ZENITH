/**
 * Scheduled Reports — Strict Type Definitions
 *
 * ZERO `any` TOLERANCE.
 * These interfaces define the BullMQ job payload and report configuration
 * for the cron-to-queue-to-S3 pipeline.
 */

// ---------------------------------------------------------------------------
// Enums — unified onto the canonical contract layer (Step 3)
// ---------------------------------------------------------------------------

// The scheduled pipeline shares the single source of truth now: the cron,
// processor, job payload, and S3/job-id builders all speak `ReportType` /
// `ReportFormat`. The previous `ScheduledReportType` (4 values) /
// `ScheduledReportFormat` (2 values) enums are gone — their string literals
// are a subset of the unified enums, so existing BullMQ payloads and S3 keys
// stay byte-compatible. `cumulative-flow` and `csv` are now schedulable too.
import { ReportType, ReportFormat } from './reports.interfaces';

export { ReportType, ReportFormat } from './reports.interfaces';

// ---------------------------------------------------------------------------
// BullMQ Job Payload
// ---------------------------------------------------------------------------

/**
 * BullMQ job data for scheduled report generation.
 *
 * DETERMINISTIC JOB ID:
 * Format: `scheduled-report:{projectId}:{year}-W{week}:{format}`
 * Example: `scheduled-report:abc-123:2026-W09:pdf`
 *
 * BullMQ silently ignores `queue.add()` if a job with the same ID
 * already exists. This guarantees idempotency even if the cron fires
 * twice due to pod restarts.
 */
export interface IScheduledReportJob {
  /** Project ID to generate report for */
  projectId: string;

  /** Organization ID (tenant) for tenant-scoped queries and S3 path */
  organizationId: string;

  /** Project name for report branding */
  projectName: string;

  /** Report type to generate */
  reportType: ReportType;

  /** Export format */
  format: ReportFormat;

  /** ISO week string for deduplication (e.g., '2026-W09') */
  weekIdentifier: string;

  /** User ID to run queries under (system service account) */
  userId: string;
}

// ---------------------------------------------------------------------------
// S3 Path Builder
// ---------------------------------------------------------------------------

/**
 * Build deterministic S3 key for scheduled reports.
 *
 * Pattern: reports/{tenantId}/{projectId}/weekly-{date}.{format}
 * Example: reports/org-abc/proj-123/weekly-2026-03-02.pdf
 */
export function buildReportS3Key(
  organizationId: string,
  projectId: string,
  date: string,
  format: ReportFormat,
): string {
  return `reports/${organizationId}/${projectId}/weekly-${date}.${format}`;
}

/**
 * Build deterministic BullMQ job ID.
 *
 * Pattern: scheduled-report:{projectId}:{weekIdentifier}:{format}
 * Example: scheduled-report:abc-123:2026-W09:pdf
 */
export function buildJobId(
  projectId: string,
  weekIdentifier: string,
  format: ReportFormat,
): string {
  return `scheduled-report:${projectId}:${weekIdentifier}:${format}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** BullMQ queue name for scheduled reports */
export const SCHEDULED_REPORTS_QUEUE = 'scheduled-reports-queue';

/** Default report formats to generate per project */
export const DEFAULT_REPORT_FORMATS: ReportFormat[] = [ReportFormat.PDF];

/** Default report types to generate per project */
export const DEFAULT_REPORT_TYPES: ReportType[] = [
  ReportType.VELOCITY,
  ReportType.ISSUE_BREAKDOWN,
];

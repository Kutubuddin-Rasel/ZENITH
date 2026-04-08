/**
 * Scheduled Reports — Strict Type Definitions
 *
 * ZERO `any` TOLERANCE.
 * These interfaces define the BullMQ job payload and report configuration
 * for the cron-to-queue-to-S3 pipeline.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Supported export formats for scheduled reports */
export enum ScheduledReportFormat {
  PDF = 'pdf',
  XLSX = 'xlsx',
}

/** Report types that can be scheduled */
export enum ScheduledReportType {
  VELOCITY = 'velocity',
  BURNDOWN = 'burndown',
  EPIC_PROGRESS = 'epic-progress',
  ISSUE_BREAKDOWN = 'issue-breakdown',
}

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
  reportType: ScheduledReportType;

  /** Export format */
  format: ScheduledReportFormat;

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
  format: ScheduledReportFormat,
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
  format: ScheduledReportFormat,
): string {
  return `scheduled-report:${projectId}:${weekIdentifier}:${format}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** BullMQ queue name for scheduled reports */
export const SCHEDULED_REPORTS_QUEUE = 'scheduled-reports-queue';

/** Default report formats to generate per project */
export const DEFAULT_REPORT_FORMATS: ScheduledReportFormat[] = [
  ScheduledReportFormat.PDF,
];

/** Default report types to generate per project */
export const DEFAULT_REPORT_TYPES: ScheduledReportType[] = [
  ScheduledReportType.VELOCITY,
  ScheduledReportType.ISSUE_BREAKDOWN,
];

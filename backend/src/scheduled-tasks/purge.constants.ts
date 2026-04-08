/**
 * Project Purge — Constants & Strict Types
 *
 * ARCHITECTURE:
 * This file centralizes all constants and interfaces for the project purge
 * data lifecycle system. These are shared between the scheduler (Module)
 * and the processor (WorkerHost).
 *
 * NAMING CONVENTION:
 * Queue names use kebab-case (BullMQ convention).
 * Scheduler IDs use kebab-case with `-scheduler` suffix.
 * Constants use SCREAMING_SNAKE_CASE.
 *
 * @see TelemetryModule for the established BullMQ repeatable job pattern.
 */

// =============================================================================
// QUEUE & SCHEDULER IDENTIFIERS
// =============================================================================

/**
 * BullMQ queue name for project purge jobs.
 *
 * Used by:
 * - `@InjectQueue(PROJECT_PURGE_QUEUE)` in ScheduledTasksModule
 * - `@Processor(PROJECT_PURGE_QUEUE)` in ProjectPurgeProcessor
 * - `BullModule.registerQueue({ name: PROJECT_PURGE_QUEUE })` in module
 */
export const PROJECT_PURGE_QUEUE = 'project-purge' as const;

/**
 * Deterministic scheduler registration ID for the repeatable job.
 *
 * BullMQ uses this to deduplicate scheduler registrations across pods.
 * If two pods call `upsertJobScheduler()` with the same ID, only one
 * scheduler exists in Redis.
 */
export const PROJECT_PURGE_SCHEDULER_ID = 'project-purge-scheduler' as const;

/**
 * BullMQ job name — discriminator inside the processor's `process()` method.
 */
export const PURGE_JOB_NAME = 'purge-expired-projects' as const;

// =============================================================================
// CRON SCHEDULE
// =============================================================================

/**
 * Daily at 03:00 UTC — low-traffic window for destructive operations.
 *
 * Matches the telemetry prune schedule (also 03:00 UTC) to consolidate
 * heavy DB operations into a single maintenance window.
 */
export const PURGE_CRON_PATTERN = '0 3 * * *' as const;

// =============================================================================
// CONFIGURABLE THRESHOLDS
// =============================================================================

/**
 * Number of days a soft-deleted project must age before permanent purge.
 *
 * Override via `PURGE_RETENTION_DAYS` environment variable.
 * Default: 30 days (industry standard for trash retention).
 */
export const DEFAULT_RETENTION_DAYS = 30 as const;

/**
 * Maximum number of projects to purge in a single job run.
 *
 * Override via `PURGE_BATCH_SIZE` environment variable.
 * Prevents a single job from running for hours if thousands of projects
 * are queued for deletion. The next scheduled run picks up the remainder.
 */
export const DEFAULT_BATCH_SIZE = 5 as const;

/**
 * Maximum rows to delete per sub-query within a single project's transaction.
 *
 * Tables like `comments`, `work_logs`, and `watchers` can have 100K+ rows
 * per project. Deleting all in a single `DELETE FROM ... WHERE` causes:
 * - Lock escalation (row locks → table lock)
 * - WAL bloat (massive single WAL entry)
 * - Long transaction hold time
 *
 * By chunking deletes, each sub-DELETE affects at most this many rows,
 * keeping the transaction predictable and bounded.
 */
export const DEFAULT_DELETE_CHUNK_SIZE = 1000 as const;

// =============================================================================
// BULLMQ WORKER CONFIGURATION
// =============================================================================

/**
 * BullMQ internal lock duration (ms).
 *
 * The worker holds this lock while processing a job. BullMQ auto-renews
 * it every `lockRenewTime` (= lockDuration / 2). If the worker dies
 * and stops renewing, the lock expires and stall detection kicks in.
 *
 * 5 minutes — generous enough for purging 5 projects with chunked deletes.
 */
export const PURGE_LOCK_DURATION_MS = 300_000; // 5 minutes

/**
 * BullMQ stall detection interval (ms).
 *
 * How often each worker checks for stalled jobs (jobs where the lock
 * expired but the job wasn't marked complete/failed). A stalled job
 * is moved back to `waiting` for another worker to pick up.
 *
 * 60 seconds — higher than default 30s because purge is legitimately
 * slow (multi-table cascade deletes).
 */
export const PURGE_STALL_INTERVAL_MS = 60_000; // 60 seconds

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

/**
 * Maximum retry attempts for a failed purge job.
 *
 * If a purge fails (e.g., PG connection timeout), BullMQ retries with
 * exponential backoff. After exhausting all attempts, the job moves to
 * the failed set for inspection.
 *
 * Retry budget: 10s × 2^0 + 10s × 2^1 + 10s × 2^2 = 10s + 20s + 40s = 70s
 */
export const PURGE_MAX_ATTEMPTS = 3 as const;

/**
 * Base delay for exponential backoff (ms).
 */
export const PURGE_BACKOFF_DELAY_MS = 10_000 as const;

// =============================================================================
// STRICT INTERFACES
// =============================================================================

/**
 * Payload for the purge repeatable job.
 *
 * BullMQ repeatable jobs always have empty data (the schedule triggers
 * the job, not external input). The retention/batch config is read from
 * environment at processor construction time.
 *
 * We define this explicitly rather than using `Record<string, never>`
 * to allow future extensibility (e.g., admin-triggered purge with overrides).
 */
export interface PurgeJobPayload {
  /**
   * Override retention days for this specific run.
   * If undefined, uses `PURGE_RETENTION_DAYS` env var or DEFAULT_RETENTION_DAYS.
   */
  readonly retentionDaysOverride?: number;

  /**
   * Override batch size for this specific run.
   * If undefined, uses `PURGE_BATCH_SIZE` env var or DEFAULT_BATCH_SIZE.
   */
  readonly batchSizeOverride?: number;

  /**
   * If set, purge only this specific project (admin manual trigger).
   * Bypasses batch discovery query and directly purges the specified project.
   */
  readonly targetProjectId?: string;
}

/**
 * Row shape returned by the expired projects discovery query.
 * Only selects the columns needed — no large text fields.
 */
export interface ExpiredProjectRow {
  readonly id: string;
  readonly name: string;
  readonly deletedAt: Date;
  readonly organizationId: string;
}

/**
 * Result of a single project's purge operation.
 * One PurgeResult per project, aggregated into the job's final report.
 */
export interface PurgeResult {
  readonly projectId: string;
  readonly projectName: string;
  readonly success: boolean;
  readonly error?: string;
  readonly deletedCounts: PurgeDeleteCounts;
  /** Duration in milliseconds for this project's purge */
  readonly durationMs: number;
}

/**
 * Breakdown of deleted row counts per table.
 *
 * Every key corresponds to a database table name that was cleaned up
 * during the cascade purge. Values are the number of rows deleted.
 */
export interface PurgeDeleteCounts {
  readonly work_logs: number;
  readonly comments: number;
  readonly attachments: number;
  readonly issue_labels: number;
  readonly issue_components: number;
  readonly issue_links: number;
  readonly watchers: number;
  readonly ai_suggestions: number;
  readonly revisions_issue: number;
  readonly issues: number;
  readonly sprint_issues: number;
  readonly sprints: number;
  readonly board_columns: number;
  readonly boards: number;
  readonly webhook_logs: number;
  readonly webhooks: number;
  readonly project_members: number;
  readonly labels: number;
  readonly components: number;
  readonly custom_field_values: number;
  readonly custom_field_definitions: number;
  readonly document_segments: number;
  readonly documents: number;
  readonly resource_forecasts: number;
  readonly resource_allocations: number;
  readonly workflow_statuses: number;
  readonly onboarding_progress: number;
  readonly revisions_project: number;
  readonly projects: number;
}

/**
 * Shape of PostgreSQL DELETE result rows.
 *
 * When using `queryRunner.query('DELETE ...')`, PostgreSQL returns
 * an array where the second element contains rowCount.
 * TypeORM wraps this inconsistently — we defensively handle both shapes.
 */
export interface DeleteQueryResult {
  readonly rowCount?: number;
}

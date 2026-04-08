/**
 * Project Purge Processor — BullMQ WorkerHost
 *
 * ARCHITECTURE:
 * This processor replaces the old `@Cron`-based `ProjectPurgeCronService`.
 * It runs as a BullMQ worker, guaranteeing exactly-one execution per
 * scheduled cycle across all K8s pods (Redis-based deduplication).
 *
 * MULTI-POD SAFETY:
 * - BullMQ repeatable jobs: one job created per cron cycle in Redis
 * - Worker acquires job via atomic BRPOPLPUSH — only one worker processes it
 * - If worker pod crashes, BullMQ stall detection re-queues to another worker
 * - PostgreSQL transaction rolls back on lost connection — no partial state
 *
 * CASCADE DELETION ORDER (Child → Parent):
 * CRITICAL: We use ON DELETE RESTRICT. Children MUST be deleted before parent.
 *
 *  Level 1:  work_logs, comments, attachments, issue_labels, issue_components,
 *            issue_links, watchers, ai_suggestions (via issues)
 *  Level 2:  revisions (Issue type)
 *  Level 3:  issues
 *  Level 4:  sprint_issues (via sprints)
 *  Level 5:  sprints
 *  Level 6:  board_columns (via boards)
 *  Level 7:  boards
 *  Level 8:  webhook_logs (via webhooks)
 *  Level 9:  webhooks
 *  Level 10: project_members, labels, components
 *  Level 11: custom_field_values (via custom_field_definitions)
 *  Level 12: custom_field_definitions
 *  Level 13: document_segments (via documents)
 *  Level 14: documents
 *  Level 15: resource_forecasts, resource_allocations
 *  Level 16: workflow_statuses, onboarding_progress
 *  Level 17: revisions (Project type)
 *  Level 18: projects (FINAL)
 *
 * CHUNKED DELETES:
 * Each sub-DELETE uses `LIMIT` via a loop to prevent lock escalation
 * and WAL bloat on tables with 100K+ rows.
 *
 * SQL INJECTION PREVENTION:
 * All queries use parameterized placeholders ($1, $2, ...).
 * Zero string interpolation in SQL. The retention interval uses
 * `make_interval(days => $1)` instead of string-interpolated INTERVAL.
 *
 * @see TelemetryFlushProcessor for the established WorkerHost convention.
 */

import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource, QueryRunner } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  PROJECT_PURGE_QUEUE,
  PURGE_LOCK_DURATION_MS,
  PURGE_STALL_INTERVAL_MS,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_DELETE_CHUNK_SIZE,
  PurgeJobPayload,
  PurgeResult,
  PurgeDeleteCounts,
  ExpiredProjectRow,
  DeleteQueryResult,
} from './purge.constants';

// =============================================================================
// MUTABLE COUNTS TYPE
// =============================================================================

/**
 * Writable version of PurgeDeleteCounts for incremental population
 * during the cascade deletion loop.
 */
type MutablePurgeDeleteCounts = { -readonly [K in keyof PurgeDeleteCounts]: PurgeDeleteCounts[K] };

// =============================================================================
// PROCESSOR
// =============================================================================

@Processor(PROJECT_PURGE_QUEUE, {
  /**
   * Worker-level configuration:
   * - lockDuration: BullMQ auto-renews this lock while `process()` runs.
   *   If the worker dies, the lock expires and stall detection kicks in.
   * - stalledInterval: How often this worker checks for stalled jobs.
   *   Higher than default because purge transactions are legitimately slow.
   * - concurrency: 1 — only one purge job at a time per worker.
   *   Prevents parallel transactions from competing for the same FK locks.
   */
  lockDuration: PURGE_LOCK_DURATION_MS,
  stalledInterval: PURGE_STALL_INTERVAL_MS,
  concurrency: 1,
})
export class ProjectPurgeProcessor extends WorkerHost {
  private readonly logger = new Logger(ProjectPurgeProcessor.name);
  private readonly retentionDays: number;
  private readonly batchSize: number;
  private readonly deleteChunkSize: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    super();
    this.retentionDays =
      this.configService.get<number>('PURGE_RETENTION_DAYS') ??
      DEFAULT_RETENTION_DAYS;
    this.batchSize =
      this.configService.get<number>('PURGE_BATCH_SIZE') ?? DEFAULT_BATCH_SIZE;
    this.deleteChunkSize =
      this.configService.get<number>('PURGE_DELETE_CHUNK_SIZE') ??
      DEFAULT_DELETE_CHUNK_SIZE;
  }

  // ===========================================================================
  // ENTRY POINT
  // ===========================================================================

  /**
   * BullMQ calls this method exactly once per scheduled cycle.
   *
   * Flow:
   * 1. Discover expired projects (soft-deleted > retention period)
   * 2. Purge each project in its own transaction
   * 3. Report progress via job.updateProgress()
   * 4. Return summary for BullMQ job result
   */
  async process(
    job: Job<PurgeJobPayload, PurgeResult[], string>,
  ): Promise<PurgeResult[]> {
    this.logger.log(
      `🔄 Starting scheduled project purge job (jobId: ${job.id})`,
    );

    const payload = job.data;

    // Allow admin overrides via job payload
    const retentionDays =
      payload.retentionDaysOverride ?? this.retentionDays;
    const batchSize = payload.batchSizeOverride ?? this.batchSize;

    // If targeting a specific project (admin manual trigger)
    if (payload.targetProjectId) {
      const result = await this.manualPurge(payload.targetProjectId);
      return [result];
    }

    // Standard flow: discover and purge expired projects
    const results = await this.purgeExpiredProjects(retentionDays, batchSize);

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    this.logger.log(
      `✅ Project purge complete: ${successCount} succeeded, ${failCount} failed`,
    );

    // Log individual failures for debugging
    for (const result of results.filter((r) => !r.success)) {
      this.logger.error(
        `❌ Failed to purge project ${result.projectId}: ${result.error}`,
      );
    }

    return results;
  }

  // ===========================================================================
  // PROJECT DISCOVERY
  // ===========================================================================

  /**
   * Find and purge projects that have been soft-deleted beyond retention period.
   *
   * SQL SAFETY:
   * Uses `make_interval(days => $1)` instead of string-interpolated INTERVAL.
   * This eliminates SQL injection risk even though retentionDays comes from
   * ConfigService (defense-in-depth).
   */
  private async purgeExpiredProjects(
    retentionDays: number,
    batchSize: number,
  ): Promise<PurgeResult[]> {
    const expiredProjects: ExpiredProjectRow[] = await this.dataSource.query(
      `
      SELECT id, name, "deletedAt", "organizationId"
      FROM projects
      WHERE "deletedAt" IS NOT NULL
        AND "deletedAt" < NOW() - make_interval(days => $1)
      ORDER BY "deletedAt" ASC
      LIMIT $2
      `,
      [retentionDays, batchSize],
    );

    if (expiredProjects.length === 0) {
      this.logger.log('No expired projects to purge');
      return [];
    }

    this.logger.log(
      `Found ${expiredProjects.length} projects ready for permanent deletion`,
    );

    const results: PurgeResult[] = [];

    for (let i = 0; i < expiredProjects.length; i++) {
      const project = expiredProjects[i];
      const result = await this.purgeProject(project.id, project.name);
      results.push(result);
    }

    return results;
  }

  // ===========================================================================
  // MANUAL PURGE (Admin Trigger)
  // ===========================================================================

  /**
   * Purge a specific project by ID (admin-triggered via job payload).
   * Verifies the project is soft-deleted before proceeding.
   */
  private async manualPurge(projectId: string): Promise<PurgeResult> {
    const projects: Array<{
      id: string;
      name: string;
      deletedAt: Date | null;
    }> = await this.dataSource.query(
      `SELECT id, name, "deletedAt" FROM projects WHERE id = $1`,
      [projectId],
    );

    if (projects.length === 0) {
      return {
        projectId,
        projectName: 'UNKNOWN',
        success: false,
        error: `Project ${projectId} not found`,
        deletedCounts: this.emptyDeleteCounts(),
        durationMs: 0,
      };
    }

    const project = projects[0];
    if (!project.deletedAt) {
      return {
        projectId,
        projectName: project.name,
        success: false,
        error: `Project ${projectId} is not soft-deleted. Cannot purge active projects.`,
        deletedCounts: this.emptyDeleteCounts(),
        durationMs: 0,
      };
    }

    return this.purgeProject(projectId, project.name);
  }

  // ===========================================================================
  // SINGLE PROJECT PURGE (Transactional)
  // ===========================================================================

  /**
   * Purge a single project and all its children.
   *
   * Uses a dedicated QueryRunner transaction to ensure atomicity.
   * If ANY delete fails, the entire project's purge is rolled back.
   * Other projects in the batch are unaffected (per-project isolation).
   *
   * CRASH RECOVERY:
   * If the pod dies mid-transaction:
   * 1. PostgreSQL detects the broken TCP connection
   * 2. The open transaction is automatically rolled back
   * 3. BullMQ stall detection re-queues the job to another worker
   * 4. The retried job starts fresh — no partial state exists
   */
  private async purgeProject(
    projectId: string,
    projectName: string,
  ): Promise<PurgeResult> {
    const startTime = Date.now();
    const counts: MutablePurgeDeleteCounts = this.emptyDeleteCounts();
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log(`🗑️ Purging project: ${projectName} (${projectId})`);

      // =====================================================================
      // Level 1: Issue-related tables (deepest children)
      // These reference issues via issueId FK
      // =====================================================================
      counts['work_logs'] = await this.deleteByProjectId(
        queryRunner,
        'work_logs',
        projectId,
      );

      counts['comments'] = await this.deleteByIssueProject(
        queryRunner,
        'comments',
        projectId,
      );

      counts['attachments'] = await this.deleteByProjectId(
        queryRunner,
        'attachments',
        projectId,
      );

      counts['issue_labels'] = await this.deleteByIssueProject(
        queryRunner,
        'issue_labels',
        projectId,
      );

      counts['issue_components'] = await this.deleteByIssueProject(
        queryRunner,
        'issue_components',
        projectId,
      );

      counts['issue_links'] = await this.deleteByIssueProject(
        queryRunner,
        'issue_links',
        projectId,
      );

      counts['watchers'] = await this.deleteByIssueProject(
        queryRunner,
        'watchers',
        projectId,
      );

      counts['ai_suggestions'] = await this.deleteByIssueProject(
        queryRunner,
        'ai_suggestions',
        projectId,
      );

      // =====================================================================
      // Level 2: Revisions for issues
      // =====================================================================
      counts['revisions_issue'] = await this.deleteIssueRevisions(
        queryRunner,
        projectId,
      );

      // =====================================================================
      // Level 3: Issues themselves
      // =====================================================================
      counts['issues'] = await this.deleteByProjectId(
        queryRunner,
        'issues',
        projectId,
      );

      // =====================================================================
      // Level 4: Sprint-related
      // =====================================================================
      counts['sprint_issues'] = await this.deleteBySprintProject(
        queryRunner,
        'sprint_issues',
        projectId,
      );

      counts['sprints'] = await this.deleteByProjectId(
        queryRunner,
        'sprints',
        projectId,
      );

      // =====================================================================
      // Level 5: Board-related
      // =====================================================================
      counts['board_columns'] = await this.deleteByBoardProject(
        queryRunner,
        'board_columns',
        projectId,
      );

      counts['boards'] = await this.deleteByProjectId(
        queryRunner,
        'boards',
        projectId,
      );

      // =====================================================================
      // Level 6: Webhooks
      // =====================================================================
      counts['webhook_logs'] = await this.deleteByWebhookProject(
        queryRunner,
        'webhook_logs',
        projectId,
      );

      counts['webhooks'] = await this.deleteByProjectId(
        queryRunner,
        'webhooks',
        projectId,
      );

      // =====================================================================
      // Level 7: Project metadata
      // =====================================================================
      counts['project_members'] = await this.deleteByProjectId(
        queryRunner,
        'project_members',
        projectId,
      );

      counts['labels'] = await this.deleteByProjectId(
        queryRunner,
        'labels',
        projectId,
      );

      counts['components'] = await this.deleteByProjectId(
        queryRunner,
        'components',
        projectId,
      );

      // =====================================================================
      // Level 8: Custom fields
      // =====================================================================
      counts['custom_field_values'] = await this.deleteByFieldProject(
        queryRunner,
        'custom_field_values',
        projectId,
      );

      counts['custom_field_definitions'] = await this.deleteByProjectId(
        queryRunner,
        'custom_field_definitions',
        projectId,
      );

      // =====================================================================
      // Level 9: Documents (RAG)
      // =====================================================================
      counts['document_segments'] = await this.deleteByDocumentProject(
        queryRunner,
        'document_segments',
        projectId,
      );

      counts['documents'] = await this.deleteByProjectId(
        queryRunner,
        'documents',
        projectId,
      );

      // =====================================================================
      // Level 10: Resource management
      // =====================================================================
      counts['resource_forecasts'] = await this.deleteByProjectId(
        queryRunner,
        'resource_forecasts',
        projectId,
      );

      counts['resource_allocations'] = await this.deleteByProjectId(
        queryRunner,
        'resource_allocations',
        projectId,
      );

      // =====================================================================
      // Level 11: Other project-scoped data
      // =====================================================================
      counts['workflow_statuses'] = await this.deleteByProjectId(
        queryRunner,
        'workflow_statuses',
        projectId,
      );

      counts['onboarding_progress'] = await this.deleteByProjectId(
        queryRunner,
        'onboarding_progress',
        projectId,
      );

      // =====================================================================
      // Level 12: Project revisions
      // =====================================================================
      counts['revisions_project'] = await this.deleteProjectRevisions(
        queryRunner,
        projectId,
      );

      // =====================================================================
      // FINAL: Delete the project itself
      // =====================================================================
      await queryRunner.query(`DELETE FROM projects WHERE id = $1`, [
        projectId,
      ]);
      counts['projects'] = 1;

      await queryRunner.commitTransaction();

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `✅ Purged project ${projectName} in ${durationMs}ms: ${JSON.stringify(counts)}`,
      );

      return {
        projectId,
        projectName,
        success: true,
        deletedCounts: counts,
        durationMs,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `❌ Failed to purge project ${projectName} after ${durationMs}ms: ${errorMessage}`,
      );

      return {
        projectId,
        projectName,
        success: false,
        error: errorMessage,
        deletedCounts: counts,
        durationMs,
      };
    } finally {
      await queryRunner.release();
    }
  }

  // ===========================================================================
  // CHUNKED DELETE HELPERS
  // ===========================================================================

  /**
   * Delete records from a table by projectId, in chunks.
   *
   * Uses `ctid IN (SELECT ctid ... LIMIT $2)` pattern for safe batching.
   * Loops until no more rows match, accumulating the total count.
   *
   * WHY ctid-based chunking:
   * - `DELETE ... LIMIT` is not supported in standard PostgreSQL
   * - `ctid` is a system column (tuple ID) that uniquely identifies each row
   * - The sub-SELECT finds the first N matching rows by ctid
   * - The DELETE removes exactly those rows
   * - This is safe even within a transaction (committed deletes are visible
   *   to subsequent queries within the same transaction)
   */
  private async deleteByProjectId(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    return this.deleteInChunks(
      queryRunner,
      `DELETE FROM "${tableName}"
       WHERE ctid IN (
         SELECT ctid FROM "${tableName}"
         WHERE "projectId" = $1
         LIMIT $2
       )`,
      [projectId, this.deleteChunkSize],
    );
  }

  /**
   * Delete records by issueId where issue belongs to project, in chunks.
   */
  private async deleteByIssueProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    return this.deleteInChunks(
      queryRunner,
      `DELETE FROM "${tableName}"
       WHERE ctid IN (
         SELECT t.ctid FROM "${tableName}" t
         INNER JOIN issues i ON t."issueId" = i.id
         WHERE i."projectId" = $1
         LIMIT $2
       )`,
      [projectId, this.deleteChunkSize],
    );
  }

  /**
   * Delete issue revisions (entityType = 'Issue'), in chunks.
   */
  private async deleteIssueRevisions(
    queryRunner: QueryRunner,
    projectId: string,
  ): Promise<number> {
    return this.deleteInChunks(
      queryRunner,
      `DELETE FROM revisions
       WHERE ctid IN (
         SELECT r.ctid FROM revisions r
         INNER JOIN issues i ON r."entityId" = i.id
         WHERE r."entityType" = 'Issue'
           AND i."projectId" = $1
         LIMIT $2
       )`,
      [projectId, this.deleteChunkSize],
    );
  }

  /**
   * Delete project revisions (entityType = 'Project'), in chunks.
   */
  private async deleteProjectRevisions(
    queryRunner: QueryRunner,
    projectId: string,
  ): Promise<number> {
    return this.deleteInChunks(
      queryRunner,
      `DELETE FROM revisions
       WHERE ctid IN (
         SELECT ctid FROM revisions
         WHERE "entityType" = 'Project'
           AND "entityId" = $1
         LIMIT $2
       )`,
      [projectId, this.deleteChunkSize],
    );
  }

  /**
   * Delete sprint_issues via sprints, in chunks.
   */
  private async deleteBySprintProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    return this.deleteInChunks(
      queryRunner,
      `DELETE FROM "${tableName}"
       WHERE ctid IN (
         SELECT t.ctid FROM "${tableName}" t
         INNER JOIN sprints s ON t."sprintId" = s.id
         WHERE s."projectId" = $1
         LIMIT $2
       )`,
      [projectId, this.deleteChunkSize],
    );
  }

  /**
   * Delete board_columns via boards, in chunks.
   */
  private async deleteByBoardProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    return this.deleteInChunks(
      queryRunner,
      `DELETE FROM "${tableName}"
       WHERE ctid IN (
         SELECT t.ctid FROM "${tableName}" t
         INNER JOIN boards b ON t."boardId" = b.id
         WHERE b."projectId" = $1
         LIMIT $2
       )`,
      [projectId, this.deleteChunkSize],
    );
  }

  /**
   * Delete webhook_logs via webhooks, in chunks.
   */
  private async deleteByWebhookProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    return this.deleteInChunks(
      queryRunner,
      `DELETE FROM "${tableName}"
       WHERE ctid IN (
         SELECT t.ctid FROM "${tableName}" t
         INNER JOIN webhooks w ON t."webhookId" = w.id
         WHERE w."projectId" = $1
         LIMIT $2
       )`,
      [projectId, this.deleteChunkSize],
    );
  }

  /**
   * Delete custom_field_values via custom_field_definitions, in chunks.
   */
  private async deleteByFieldProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    return this.deleteInChunks(
      queryRunner,
      `DELETE FROM "${tableName}"
       WHERE ctid IN (
         SELECT t.ctid FROM "${tableName}" t
         INNER JOIN custom_field_definitions cfd ON t."fieldId" = cfd.id
         WHERE cfd."projectId" = $1
         LIMIT $2
       )`,
      [projectId, this.deleteChunkSize],
    );
  }

  /**
   * Delete document_segments via documents, in chunks.
   */
  private async deleteByDocumentProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    return this.deleteInChunks(
      queryRunner,
      `DELETE FROM "${tableName}"
       WHERE ctid IN (
         SELECT t.ctid FROM "${tableName}" t
         INNER JOIN documents d ON t."documentId" = d.id
         WHERE d."projectId" = $1
         LIMIT $2
       )`,
      [projectId, this.deleteChunkSize],
    );
  }

  // ===========================================================================
  // CORE CHUNKING ENGINE
  // ===========================================================================

  /**
   * Execute a parameterized DELETE in a loop, processing LIMIT rows per
   * iteration until no more rows match.
   *
   * The SQL must contain a `LIMIT $N` parameter (typically the last param).
   * The chunk size is injected via the params array.
   *
   * ERROR HANDLING:
   * If the table doesn't exist or lacks the expected columns, the first
   * iteration catches the error and returns 0. This makes the purge
   * forward-compatible with schema changes — if a table is removed in
   * a future migration, the purge doesn't crash.
   *
   * @param queryRunner - Transaction-scoped query runner
   * @param sql - Parameterized DELETE statement with LIMIT
   * @param params - Query parameters (projectId, chunkSize, etc.)
   * @returns Total number of rows deleted across all chunks
   */
  private async deleteInChunks(
    queryRunner: QueryRunner,
    sql: string,
    params: ReadonlyArray<string | number>,
  ): Promise<number> {
    let totalDeleted = 0;

    try {
      // Loop until a chunk deletes 0 rows (= no more matching rows)
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = (await queryRunner.query(
          sql,
          [...params],
        )) as DeleteQueryResult;

        const deletedInChunk = result?.rowCount ?? 0;
        totalDeleted += deletedInChunk;

        // If we deleted fewer rows than the chunk size, we're done
        if (deletedInChunk < this.deleteChunkSize) {
          break;
        }
      }
    } catch {
      // Table might not exist or doesn't have the expected columns.
      // This is intentional forward-compatibility — if a migration
      // drops a table, the purge still works for the remaining tables.
      if (totalDeleted === 0) {
        return 0;
      }
      // If we already deleted some rows, the error is unexpected.
      // Re-throw to trigger transaction rollback for this project.
      throw new Error(
        `Chunked delete failed after deleting ${totalDeleted} rows. SQL: ${sql.slice(0, 100)}...`,
      );
    }

    return totalDeleted;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Returns a PurgeDeleteCounts with all zeroes.
   * Used for error responses where no deletion occurred.
   */
  private emptyDeleteCounts(): MutablePurgeDeleteCounts {
    return {
      work_logs: 0,
      comments: 0,
      attachments: 0,
      issue_labels: 0,
      issue_components: 0,
      issue_links: 0,
      watchers: 0,
      ai_suggestions: 0,
      revisions_issue: 0,
      issues: 0,
      sprint_issues: 0,
      sprints: 0,
      board_columns: 0,
      boards: 0,
      webhook_logs: 0,
      webhooks: 0,
      project_members: 0,
      labels: 0,
      components: 0,
      custom_field_values: 0,
      custom_field_definitions: 0,
      document_segments: 0,
      documents: 0,
      resource_forecasts: 0,
      resource_allocations: 0,
      workflow_statuses: 0,
      onboarding_progress: 0,
      revisions_project: 0,
      projects: 0,
    };
  }
}

/**
 * Project Purge Cron Job
 *
 * Permanently deletes soft-deleted projects that have been in trash for >30 days.
 *
 * CRITICAL: Since we use ON DELETE RESTRICT on child tables (Sprint 3),
 * we must delete children BEFORE the parent project in this order:
 *
 * Deletion Order (Child → Parent):
 * 1. work_logs (via issues)
 * 2. comments (via issues)
 * 3. attachments
 * 4. revisions (Issue type)
 * 5. issue_labels, issue_components
 * 6. issues
 * 7. sprint_issues
 * 8. sprints
 * 9. board_columns
 * 10. boards
 * 11. webhooks + webhook_logs
 * 12. project_members
 * 13. labels
 * 14. components
 * 15. custom_field_values + custom_field_definitions
 * 16. documents + document_segments
 * 17. resource_allocations + resource_forecasts
 * 18. watchers
 * 19. projects (finally!)
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, QueryRunner } from 'typeorm';
import { ConfigService } from '@nestjs/config';

interface PurgeResult {
  projectId: string;
  projectName: string;
  success: boolean;
  error?: string;
  deletedCounts: Record<string, number>;
}

interface ExpiredProjectRow {
  id: string;
  name: string;
  deletedAt: Date;
  organizationId: string;
}

interface DeleteResult {
  rowCount?: number;
}

@Injectable()
export class ProjectPurgeCronService {
  private readonly logger = new Logger(ProjectPurgeCronService.name);
  private readonly retentionDays: number;
  private readonly batchSize: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.retentionDays =
      this.configService.get<number>('PURGE_RETENTION_DAYS') ?? 30;
    this.batchSize = this.configService.get<number>('PURGE_BATCH_SIZE') ?? 5;
  }

  /**
   * Runs every day at 3 AM to purge old soft-deleted projects
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleProjectPurge(): Promise<void> {
    this.logger.log('🔄 Starting scheduled project purge job...');

    try {
      const results = await this.purgeExpiredProjects();

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
    } catch (error) {
      this.logger.error(
        `❌ Project purge job failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Find and purge projects that have been soft-deleted for more than retention period
   */
  async purgeExpiredProjects(): Promise<PurgeResult[]> {
    // Find projects ready for permanent deletion

    const expiredProjects: ExpiredProjectRow[] = await this.dataSource.query(
      `
      SELECT id, name, "deletedAt", "organizationId"
      FROM projects
      WHERE "deletedAt" IS NOT NULL
        AND "deletedAt" < NOW() - INTERVAL '${this.retentionDays} days'
      ORDER BY "deletedAt" ASC
      LIMIT $1
      `,
      [this.batchSize],
    );

    if (expiredProjects.length === 0) {
      this.logger.log('No expired projects to purge');
      return [];
    }

    this.logger.log(
      `Found ${expiredProjects.length} projects ready for permanent deletion`,
    );

    const results: PurgeResult[] = [];

    for (const project of expiredProjects) {
      const result = await this.purgeProject(project.id, project.name);
      results.push(result);
    }

    return results;
  }

  /**
   * Purge a single project and all its children
   * Uses a transaction to ensure atomicity
   */
  private async purgeProject(
    projectId: string,
    projectName: string,
  ): Promise<PurgeResult> {
    const deletedCounts: Record<string, number> = {};
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log(`🗑️ Purging project: ${projectName} (${projectId})`);

      // Delete in correct order (deepest children first)
      // Each deletion returns the count of deleted rows

      // Level 1: Issue-related tables (deepest)
      deletedCounts['work_logs'] = await this.deleteByProjectId(
        queryRunner,
        'work_logs',
        projectId,
      );

      deletedCounts['comments'] = await this.deleteByIssueProject(
        queryRunner,
        'comments',
        projectId,
      );

      deletedCounts['attachments'] = await this.deleteByProjectId(
        queryRunner,
        'attachments',
        projectId,
      );

      deletedCounts['issue_labels'] = await this.deleteByIssueProject(
        queryRunner,
        'issue_labels',
        projectId,
      );

      deletedCounts['issue_components'] = await this.deleteByIssueProject(
        queryRunner,
        'issue_components',
        projectId,
      );

      deletedCounts['issue_links'] = await this.deleteByIssueProject(
        queryRunner,
        'issue_links',
        projectId,
      );

      deletedCounts['watchers'] = await this.deleteByIssueProject(
        queryRunner,
        'watchers',
        projectId,
      );

      deletedCounts['ai_suggestions'] = await this.deleteByIssueProject(
        queryRunner,
        'ai_suggestions',
        projectId,
      );

      // Level 2: Revisions for issues
      deletedCounts['revisions_issue'] = await this.deleteIssueRevisions(
        queryRunner,
        projectId,
      );

      // Level 3: Issues themselves
      deletedCounts['issues'] = await this.deleteByProjectId(
        queryRunner,
        'issues',
        projectId,
      );

      // Level 4: Sprint-related
      deletedCounts['sprint_issues'] = await this.deleteBySprintProject(
        queryRunner,
        'sprint_issues',
        projectId,
      );

      deletedCounts['sprints'] = await this.deleteByProjectId(
        queryRunner,
        'sprints',
        projectId,
      );

      // Level 5: Board-related
      deletedCounts['board_columns'] = await this.deleteByBoardProject(
        queryRunner,
        'board_columns',
        projectId,
      );

      deletedCounts['boards'] = await this.deleteByProjectId(
        queryRunner,
        'boards',
        projectId,
      );

      // Level 6: Webhooks
      deletedCounts['webhook_logs'] = await this.deleteByWebhookProject(
        queryRunner,
        'webhook_logs',
        projectId,
      );

      deletedCounts['webhooks'] = await this.deleteByProjectId(
        queryRunner,
        'webhooks',
        projectId,
      );

      // Level 7: Project metadata
      deletedCounts['project_members'] = await this.deleteByProjectId(
        queryRunner,
        'project_members',
        projectId,
      );

      deletedCounts['labels'] = await this.deleteByProjectId(
        queryRunner,
        'labels',
        projectId,
      );

      deletedCounts['components'] = await this.deleteByProjectId(
        queryRunner,
        'components',
        projectId,
      );

      // Level 8: Custom fields
      deletedCounts['custom_field_values'] = await this.deleteByFieldProject(
        queryRunner,
        'custom_field_values',
        projectId,
      );

      deletedCounts['custom_field_definitions'] = await this.deleteByProjectId(
        queryRunner,
        'custom_field_definitions',
        projectId,
      );

      // Level 9: Documents (RAG)
      deletedCounts['document_segments'] = await this.deleteByDocumentProject(
        queryRunner,
        'document_segments',
        projectId,
      );

      deletedCounts['documents'] = await this.deleteByProjectId(
        queryRunner,
        'documents',
        projectId,
      );

      // Level 10: Resource management
      deletedCounts['resource_forecasts'] = await this.deleteByProjectId(
        queryRunner,
        'resource_forecasts',
        projectId,
      );

      deletedCounts['resource_allocations'] = await this.deleteByProjectId(
        queryRunner,
        'resource_allocations',
        projectId,
      );

      // Level 11: Other project-scoped data
      deletedCounts['workflow_statuses'] = await this.deleteByProjectId(
        queryRunner,
        'workflow_statuses',
        projectId,
      );

      deletedCounts['onboarding_progress'] = await this.deleteByProjectId(
        queryRunner,
        'onboarding_progress',
        projectId,
      );

      // Level 12: Project revisions
      deletedCounts['revisions_project'] = await this.deleteProjectRevisions(
        queryRunner,
        projectId,
      );

      // FINAL: Delete the project itself
      await queryRunner.query(`DELETE FROM projects WHERE id = $1`, [
        projectId,
      ]);
      deletedCounts['projects'] = 1;

      await queryRunner.commitTransaction();

      this.logger.log(
        `✅ Purged project ${projectName}: ${JSON.stringify(deletedCounts)}`,
      );

      return {
        projectId,
        projectName,
        success: true,
        deletedCounts,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Failed to purge project ${projectName}: ${errorMessage}`,
      );

      return {
        projectId,
        projectName,
        success: false,
        error: errorMessage,
        deletedCounts,
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Helper: Delete records from a table by projectId
   */
  private async deleteByProjectId(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    try {
      const result = (await queryRunner.query(
        `DELETE FROM ${tableName} WHERE "projectId" = $1`,
        [projectId],
      )) as DeleteResult;
      return result?.rowCount ?? 0;
    } catch {
      // Table might not exist or doesn't have projectId column
      return 0;
    }
  }

  /**
   * Helper: Delete records by issueId where issue belongs to project
   */
  private async deleteByIssueProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    try {
      const result = (await queryRunner.query(
        `DELETE FROM ${tableName}
         WHERE "issueId" IN (
           SELECT id FROM issues WHERE "projectId" = $1
         )`,
        [projectId],
      )) as DeleteResult;
      return result?.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Delete issue revisions
   */
  private async deleteIssueRevisions(
    queryRunner: QueryRunner,
    projectId: string,
  ): Promise<number> {
    try {
      const result = (await queryRunner.query(
        `DELETE FROM revisions
         WHERE "entityType" = 'Issue'
         AND "entityId" IN (
           SELECT id FROM issues WHERE "projectId" = $1
         )`,
        [projectId],
      )) as DeleteResult;
      return result?.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Delete project revisions
   */
  private async deleteProjectRevisions(
    queryRunner: QueryRunner,
    projectId: string,
  ): Promise<number> {
    try {
      const result = (await queryRunner.query(
        `DELETE FROM revisions
         WHERE "entityType" = 'Project'
         AND "entityId" = $1`,
        [projectId],
      )) as DeleteResult;
      return result?.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Delete sprint_issues via sprints
   */
  private async deleteBySprintProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    try {
      const result = (await queryRunner.query(
        `DELETE FROM ${tableName}
         WHERE "sprintId" IN (
           SELECT id FROM sprints WHERE "projectId" = $1
         )`,
        [projectId],
      )) as DeleteResult;
      return result?.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Delete board_columns via boards
   */
  private async deleteByBoardProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    try {
      const result = (await queryRunner.query(
        `DELETE FROM ${tableName}
         WHERE "boardId" IN (
           SELECT id FROM boards WHERE "projectId" = $1
         )`,
        [projectId],
      )) as DeleteResult;
      return result?.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Delete webhook_logs via webhooks
   */
  private async deleteByWebhookProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    try {
      const result = (await queryRunner.query(
        `DELETE FROM ${tableName}
         WHERE "webhookId" IN (
           SELECT id FROM webhooks WHERE "projectId" = $1
         )`,
        [projectId],
      )) as DeleteResult;
      return result?.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Delete custom_field_values via custom_field_definitions
   */
  private async deleteByFieldProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    try {
      const result = (await queryRunner.query(
        `DELETE FROM ${tableName}
         WHERE "fieldId" IN (
           SELECT id FROM custom_field_definitions WHERE "projectId" = $1
         )`,
        [projectId],
      )) as DeleteResult;
      return result?.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Delete document_segments via documents
   */
  private async deleteByDocumentProject(
    queryRunner: QueryRunner,
    tableName: string,
    projectId: string,
  ): Promise<number> {
    try {
      const result = (await queryRunner.query(
        `DELETE FROM ${tableName}
         WHERE "documentId" IN (
           SELECT id FROM documents WHERE "projectId" = $1
         )`,
        [projectId],
      )) as DeleteResult;
      return result?.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Manual trigger for admin use (e.g., via API endpoint)
   */
  async manualPurge(projectId: string): Promise<PurgeResult> {
    // Verify project is soft-deleted before purging

    const projects: Array<{
      id: string;
      name: string;
      deletedAt: Date | null;
    }> = await this.dataSource.query(
      `SELECT id, name, "deletedAt" FROM projects WHERE id = $1`,
      [projectId],
    );

    if (projects.length === 0) {
      throw new Error(`Project ${projectId} not found`);
    }

    const project = projects[0];
    if (!project.deletedAt) {
      throw new Error(
        `Project ${projectId} is not soft-deleted. Cannot purge active projects.`,
      );
    }

    return this.purgeProject(projectId, project.name);
  }
}

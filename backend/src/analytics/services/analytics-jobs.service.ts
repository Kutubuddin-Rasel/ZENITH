import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { SprintsService } from '../../sprints/sprints.service';
import { SprintRiskService } from './sprint-risk.service';
import { TenantContext } from '../../core/tenant/tenant-context.service';
import { tenantJoin } from '../../core/database/safe-query.helper';
import { HistoricalMetricsService } from './historical-metrics.service';
import { MetricType } from '../entities/project-metrics.entity';

// ---------------------------------------------------------------------------
// Strict Interfaces (ZERO `any`)
// ---------------------------------------------------------------------------

export interface StalledIssue {
  id: string;
  title: string;
  assigneeId: string | null;
  projectId: string;
  projectKey: string;
  daysSinceUpdate: number;
}

/** Typed result from daily risk calculation */
interface HighRiskSprint {
  sprintName: string;
  projectId: string;
  score: number;
  level: string;
}

@Injectable()
export class AnalyticsJobsService {
  private readonly logger = new Logger(AnalyticsJobsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly sprintsService: SprintsService,
    private readonly sprintRiskService: SprintRiskService,
    private readonly tenantContext: TenantContext,
    private readonly historicalMetricsService: HistoricalMetricsService,
  ) {}

  /**
   * STALL RATE DETECTION
   * Detects issues with no activity > 3 days.
   * Runs daily at 9 AM.
   *
   * SECURITY (Phase 1 — Tenant Isolation Fix):
   * This cron job runs OUTSIDE request context (no CLS tenant ID).
   * We use a structural SQL JOIN to filter out soft-deleted projects,
   * ensuring only issues from active projects are surfaced.
   *
   * NOTE: Cross-tenant notification bleed is NOT possible here because
   * notifications are sent per-assignee (who belongs to a specific org).
   * The soft-delete filter (`p."deletedAt" IS NULL`) is the key safety net.
   *
   * CONCURRENCY NOTE: In multi-pod K8s, duplicate cron execution is possible.
   * Distributed locking is handled by the Scheduled-Tasks module (out of scope).
   */
  @Cron('0 9 * * *') // Daily at 9:00 AM
  async detectStalledIssues(): Promise<void> {
    this.logger.log('Running stall detection...');

    try {
      // @RAW_QUERY_AUDIT: Tenant safety via structural JOIN + soft-delete filter
      // Cron runs outside CLS — cannot use tenantJoin() helper.
      // Instead, we enforce p."deletedAt" IS NULL to exclude deleted orgs/projects.
      const stalledIssues: StalledIssue[] = await this.dataSource.query(`
        SELECT 
          i.id,
          i.title,
          i."assigneeId",
          i."projectId",
          p."key" as "projectKey",
          EXTRACT(DAY FROM NOW() - i."updatedAt") as "daysSinceUpdate"
        FROM issues i
        INNER JOIN projects p
          ON p.id = i."projectId"
          AND p."deletedAt" IS NULL
        WHERE i.status NOT IN ('Done', 'Archived')
        AND i."updatedAt" < NOW() - INTERVAL '3 days'
        AND i."deletedAt" IS NULL
        ORDER BY i."updatedAt" ASC
        LIMIT 100
      `);

      if (stalledIssues.length === 0) {
        this.logger.log('No stalled issues found');
        return;
      }

      this.logger.log(`Found ${stalledIssues.length} stalled issues`);

      // Group by assignee for batched notifications
      const byAssignee = new Map<string, StalledIssue[]>();

      for (const issue of stalledIssues) {
        if (issue.assigneeId) {
          const existing = byAssignee.get(issue.assigneeId) ?? [];
          existing.push(issue);
          byAssignee.set(issue.assigneeId, existing);
        }
      }

      // Send notifications to assignees
      for (const [assigneeId, issues] of byAssignee) {
        const issueList = issues
          .slice(0, 5)
          .map(
            (i) =>
              `• ${i.projectKey}: ${i.title} (${Math.floor(i.daysSinceUpdate)} days)`,
          )
          .join('\n');

        const message = `You have ${issues.length} stalled issue(s) with no activity:\n${issueList}`;

        await this.notificationsService.createMany(
          [assigneeId],
          message,
          {
            type: 'stall_alert',
            issueIds: issues.map((i) => i.id),
          },
          NotificationType.WARNING,
        );
      }

      this.logger.log(`Sent stall notifications to ${byAssignee.size} users`);

      // PHASE 4: Persist stall rate metrics per project
      const byProject = new Map<string, { count: number; orgId: string }>();
      for (const issue of stalledIssues) {
        const existing = byProject.get(issue.projectId);
        if (existing) {
          existing.count++;
        } else {
          // Query org ID for this project (needed for tenant-scoped persistence)
          const projectRows: Array<{ organizationId: string }> =
            await this.dataSource.query(
              'SELECT "organizationId" FROM projects WHERE id = $1 LIMIT 1',
              [issue.projectId],
            );
          if (projectRows[0]) {
            byProject.set(issue.projectId, {
              count: 1,
              orgId: projectRows[0].organizationId,
            });
          }
        }
      }

      for (const [projId, data] of byProject) {
        await this.historicalMetricsService.persistMetricSnapshot({
          organizationId: data.orgId,
          projectId: projId,
          metricType: MetricType.STALL_RATE,
          value: data.count,
          percentiles: null,
          referenceId: null,
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Stall detection failed: ${msg}`);
    }
  }

  /**
   * DAILY RISK CALCULATION
   * Calculates risk scores for all active sprints.
   * Runs weekdays at 8 AM.
   */
  @Cron('0 8 * * 1-5') // Weekdays at 8:00 AM
  async calculateDailyRisks(): Promise<void> {
    this.logger.log('Running daily risk calculation...');

    try {
      const activeSprints =
        await this.sprintsService.findAllActiveSystemWide_UNSAFE();

      if (activeSprints.length === 0) {
        this.logger.log('No active sprints found');
        return;
      }

      this.logger.log(
        `Calculating risk for ${activeSprints.length} active sprints`,
      );

      const highRiskSprints: HighRiskSprint[] = [];

      for (const sprint of activeSprints) {
        try {
          const risk = await this.sprintRiskService.calculateSprintRisk(
            sprint.projectId,
            sprint.id,
            'system', // System user for cron jobs
          );

          this.logger.log(
            `Sprint "${sprint.name}": Risk=${risk.score} (${risk.level})`,
          );

          if (risk.level === 'High') {
            highRiskSprints.push({
              sprintName: sprint.name,
              projectId: sprint.projectId,
              score: risk.score,
              level: risk.level,
            });
          }

          // PHASE 4: Persist risk score to time-series storage
          // Query org ID for tenant-scoped persistence (cron has no CLS)
          const orgRows: Array<{ organizationId: string }> =
            await this.dataSource.query(
              'SELECT "organizationId" FROM projects WHERE id = $1 LIMIT 1',
              [sprint.projectId],
            );
          if (orgRows[0]) {
            await this.historicalMetricsService.persistMetricSnapshot({
              organizationId: orgRows[0].organizationId,
              projectId: sprint.projectId,
              metricType: MetricType.RISK_SCORE,
              value: risk.score,
              percentiles: null,
              referenceId: sprint.id,
            });
          }

          // Capture snapshot while we're at it
          await this.sprintsService.captureSnapshot(sprint.id);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(
            `Failed to calculate risk for sprint ${sprint.id}: ${msg}`,
          );
        }
      }

      // Alert project leads about high-risk sprints
      if (highRiskSprints.length > 0) {
        this.logger.warn(
          `${highRiskSprints.length} high-risk sprints detected`,
        );
        // Could add notification to project leads here
      }

      this.logger.log('Daily risk calculation complete');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Daily risk calculation failed: ${msg}`);
    }
  }

  /**
   * Get stalled issues for a project (API endpoint).
   *
   * SECURITY (Phase 1 — Tenant Isolation Fix):
   * This runs in request context — tenantJoin() enforces tenant boundaries
   * via INNER JOIN to projects with organizationId + soft-delete filter.
   */
  async getStalledIssues(projectId: string): Promise<StalledIssue[]> {
    // @RAW_QUERY_AUDIT: Tenant isolation enforced via tenantJoin()
    return this.dataSource.query(
      `
      SELECT 
        i.id,
        i.title,
        i."assigneeId",
        i."projectId",
        p."key" as "projectKey",
        EXTRACT(DAY FROM NOW() - i."updatedAt") as "daysSinceUpdate"
      FROM issues i
      ${tenantJoin('issues', 'i', this.tenantContext)}
      JOIN projects p ON i."projectId" = p.id
      WHERE i."projectId" = $1
      AND i.status NOT IN ('Done', 'Archived')
      AND i."updatedAt" < NOW() - INTERVAL '3 days'
      ORDER BY i."updatedAt" ASC
      `,
      [projectId],
    );
  }
}

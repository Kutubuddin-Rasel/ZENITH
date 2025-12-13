import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { SprintsService } from '../../sprints/sprints.service';
import { SprintRiskService } from './sprint-risk.service';

export interface StalledIssue {
  id: string;
  title: string;
  assigneeId: string | null;
  projectId: string;
  projectKey: string;
  daysSinceUpdate: number;
}

@Injectable()
export class AnalyticsJobsService {
  private readonly logger = new Logger(AnalyticsJobsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly sprintsService: SprintsService,
    private readonly sprintRiskService: SprintRiskService,
  ) {}

  /**
   * STALL RATE DETECTION
   * Detects issues with no activity > 3 days
   * Runs daily at 9 AM
   */
  @Cron('0 9 * * *') // Daily at 9:00 AM
  async detectStalledIssues(): Promise<void> {
    this.logger.log('Running stall detection...');

    try {
      const stalledIssues: StalledIssue[] = await this.dataSource.query(`
        SELECT 
          i.id,
          i.title,
          i."assigneeId",
          i."projectId",
          p."key" as "projectKey",
          EXTRACT(DAY FROM NOW() - i."updatedAt") as "daysSinceUpdate"
        FROM issues i
        JOIN projects p ON i."projectId" = p.id
        WHERE i.status NOT IN ('Done', 'Archived')
        AND i."updatedAt" < NOW() - INTERVAL '3 days'
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
          const existing = byAssignee.get(issue.assigneeId) || [];
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
    } catch (error) {
      this.logger.error('Stall detection failed', error);
    }
  }

  /**
   * DAILY RISK CALCULATION
   * Calculates risk scores for all active sprints
   * Runs weekdays at 8 AM
   */
  @Cron('0 8 * * 1-5') // Weekdays at 8:00 AM
  async calculateDailyRisks(): Promise<void> {
    this.logger.log('Running daily risk calculation...');

    try {
      const activeSprints = await this.sprintsService.findAllActiveSystemWide();

      if (activeSprints.length === 0) {
        this.logger.log('No active sprints found');
        return;
      }

      this.logger.log(
        `Calculating risk for ${activeSprints.length} active sprints`,
      );

      const highRiskSprints: Array<{
        sprintName: string;
        projectId: string;
        score: number;
        level: string;
      }> = [];

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

          // Capture snapshot while we're at it
          await this.sprintsService.captureSnapshot(sprint.id);
        } catch (error) {
          this.logger.warn(
            `Failed to calculate risk for sprint ${sprint.id}`,
            error,
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
    } catch (error) {
      this.logger.error('Daily risk calculation failed', error);
    }
  }

  /**
   * Get stalled issues for a project (API endpoint)
   */
  async getStalledIssues(projectId: string): Promise<StalledIssue[]> {
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

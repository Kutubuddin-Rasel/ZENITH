import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SPRINT_SNAPSHOT_TOKEN, type ISprintSnapshot } from '../../sprints';
import { MetricType } from '../entities/project-metrics.entity';
import { ANALYTICS_EVENTS } from '../events/analytics-events';
import {
  ANALYTICS_READ_MODEL_TOKEN,
  PROJECT_METRICS_REPOSITORY_TOKEN,
  SPRINT_RISK_QUERY_TOKEN,
} from '../constants/analytics.tokens';
import type {
  IAnalyticsReadModel,
  IProjectMetricsRepository,
  IAnalyticsAggregationJob,
  ISprintRiskQuery,
  StalledIssue,
} from '../interfaces/analytics.interfaces';

// ---------------------------------------------------------------------------
// Strict Interfaces (ZERO `any`)
// ---------------------------------------------------------------------------

/** Typed result from daily risk calculation. */
interface HighRiskSprint {
  sprintName: string;
  projectId: string;
  score: number;
  level: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Issues with no activity beyond this many days are considered stalled. */
const STALL_THRESHOLD_DAYS = 3;

/** Upper bound on the system-wide stalled-issue scan (cron). */
const STALL_SCAN_LIMIT = 100;

/**
 * Scheduled aggregation surface (`IAnalyticsAggregationJob`) — the two `@Cron`
 * jobs extracted from the former `AnalyticsJobsService`.
 *
 * CQRS + DIP (Step 3):
 *  - The synchronous `getStalledIssues` READ moved to
 *    `StalledIssuesQueryService`; this class is now WRITE/cron only.
 *  - The old jobs class injected the CONCRETE `SprintRiskService` and
 *    `HistoricalMetricsService`. This class depends only on contracts:
 *    `SPRINT_RISK_QUERY_TOKEN` (`ISprintRiskQuery`) and
 *    `PROJECT_METRICS_REPOSITORY_TOKEN` (`IProjectMetricsRepository`) — the
 *    rollup write goes straight to the metrics port, no facade in between.
 *
 * SECURITY: both jobs run OUTSIDE request context (no CLS tenant id); the
 * read-model port relies on a structural soft-delete filter, and org ids for
 * tenant-scoped persistence are resolved explicitly per project.
 */
@Injectable()
export class AnalyticsAggregationJobService implements IAnalyticsAggregationJob {
  private readonly logger = new Logger(AnalyticsAggregationJobService.name);

  constructor(
    @Inject(ANALYTICS_READ_MODEL_TOKEN)
    private readonly readModel: IAnalyticsReadModel,
    @Inject(PROJECT_METRICS_REPOSITORY_TOKEN)
    private readonly metricsRepo: IProjectMetricsRepository,
    private readonly eventEmitter: EventEmitter2,
    @Inject(SPRINT_SNAPSHOT_TOKEN)
    private readonly sprintsService: ISprintSnapshot,
    @Inject(SPRINT_RISK_QUERY_TOKEN)
    private readonly sprintRisk: ISprintRiskQuery,
  ) {}

  /**
   * STALL RATE DETECTION — daily at 09:00.
   * Detects issues with no activity > 3 days, notifies assignees, and persists
   * the per-project stall rate to the rollup.
   *
   * CONCURRENCY: in multi-pod K8s, duplicate cron execution is possible;
   * distributed locking is owned by the Scheduled-Tasks module (out of scope).
   */
  @Cron('0 9 * * *') // Daily at 9:00 AM
  async detectStalledIssues(): Promise<void> {
    this.logger.log('Running stall detection...');

    try {
      // System-wide scan runs outside CLS (cron). Tenant safety + soft-delete
      // filtering live behind the read-model port.
      const stalledIssues: StalledIssue[] =
        await this.readModel.findStalledIssuesSystemWide(
          STALL_THRESHOLD_DAYS,
          STALL_SCAN_LIMIT,
        );

      if (stalledIssues.length === 0) {
        this.logger.log('No stalled issues found');
        return;
      }

      this.logger.log(`Found ${stalledIssues.length} stalled issues`);

      // Group by assignee for batched notifications.
      const byAssignee = new Map<string, StalledIssue[]>();

      for (const issue of stalledIssues) {
        if (issue.assigneeId) {
          const existing = byAssignee.get(issue.assigneeId) ?? [];
          existing.push(issue);
          byAssignee.set(issue.assigneeId, existing);
        }
      }

      for (const [assigneeId, issues] of byAssignee) {
        const issueList = issues
          .slice(0, 5)
          .map(
            (i) =>
              `• ${i.projectKey}: ${i.title} (${Math.floor(i.daysSinceUpdate)} days)`,
          )
          .join('\n');

        const message = `You have ${issues.length} stalled issue(s) with no activity:\n${issueList}`;

        // L1: emit instead of a synchronous cross-module write. The
        // notifications module's `AnalyticsAlertListener` (@OnEvent) creates the
        // WARNING in-app notification — same recipients/message/context as the
        // former `NotificationsService.createMany(...)` call.
        this.eventEmitter.emit(ANALYTICS_EVENTS.STALL_ALERT, {
          userIds: [assigneeId],
          message,
          context: {
            type: 'stall_alert',
            issueIds: issues.map((i) => i.id),
          },
        });
      }

      this.logger.log(`Emitted stall alerts for ${byAssignee.size} users`);

      // Persist stall rate metrics per project.
      const byProject = new Map<string, { count: number; orgId: string }>();
      for (const issue of stalledIssues) {
        const existing = byProject.get(issue.projectId);
        if (existing) {
          existing.count++;
        } else {
          // Resolve org id (needed for tenant-scoped persistence outside CLS).
          const orgId = await this.readModel.findProjectOrganizationId(
            issue.projectId,
          );
          if (orgId) {
            byProject.set(issue.projectId, { count: 1, orgId });
          }
        }
      }

      for (const [projId, data] of byProject) {
        await this.metricsRepo.upsertSnapshot({
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
   * DAILY RISK CALCULATION — weekdays at 08:00.
   * Scores risk for all active sprints, persists risk scores, and snapshots.
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

      const highRiskSprints: HighRiskSprint[] = [];

      for (const sprint of activeSprints) {
        try {
          const risk = await this.sprintRisk.calculateSprintRisk(
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

          // Persist risk score to time-series storage. Resolve org id for
          // tenant-scoped persistence (cron has no CLS).
          const orgId = await this.readModel.findProjectOrganizationId(
            sprint.projectId,
          );
          if (orgId) {
            await this.metricsRepo.upsertSnapshot({
              organizationId: orgId,
              projectId: sprint.projectId,
              metricType: MetricType.RISK_SCORE,
              value: risk.score,
              percentiles: null,
              referenceId: sprint.id,
            });
          }

          // Capture snapshot while we're at it.
          await this.sprintsService.captureSnapshot(sprint.id);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(
            `Failed to calculate risk for sprint ${sprint.id}: ${msg}`,
          );
        }
      }

      if (highRiskSprints.length > 0) {
        this.logger.warn(
          `${highRiskSprints.length} high-risk sprints detected`,
        );
      }

      this.logger.log('Daily risk calculation complete');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Daily risk calculation failed: ${msg}`);
    }
  }
}

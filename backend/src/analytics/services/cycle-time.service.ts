import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RevisionsService } from '../../revisions/revisions.service';
import { Revision } from '../../revisions/entities/revision.entity';
import { TenantContext } from '../../core/tenant/tenant-context.service';
import { tenantJoin } from '../../core/database/safe-query.helper';

export interface CycleTimeMetric {
  issueId: string;
  issueTitle: string;
  cycleTimeHours: number;
  completedAt: Date;
}

interface CycleTimeIssueRow {
  id: string;
  title: string;
  status: string;
  updatedAt: Date;
}

@Injectable()
export class CycleTimeService {
  private readonly logger = new Logger(CycleTimeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly revisionsService: RevisionsService,
    private readonly tenantContext: TenantContext,
  ) {}

  async calculateProjectCycleTime(
    projectId: string,
    usage: 'summary' | 'detailed' = 'summary',
    daysLookback = 30,
  ) {
    // 1. Fetch issues that are 'Done' within the lookback period
    // @RAW_QUERY_AUDIT: Tenant isolation verified via projects JOIN + soft-delete filter
    const issues: CycleTimeIssueRow[] = await this.dataSource.query(
      `
      SELECT i.id, i.title, i.status, i."updatedAt"
      FROM issues i
      ${tenantJoin('issues', 'i', this.tenantContext)}
      WHERE i."projectId" = $1
      AND i.status = 'Done'
      AND i."updatedAt" > NOW() - INTERVAL '${Number(daysLookback)} days'
      `,
      [projectId],
    );

    if (issues.length === 0) {
      return {
        averageDays: 0,
        trend: 'flat',
        totalIssues: 0,
        data: [],
      };
    }

    const metrics: CycleTimeMetric[] = [];

    // 2. Calculate Cycle Time for each issue
    for (const issue of issues) {
      try {
        const revisions: Revision[] = await this.revisionsService.list(
          'Issue',
          issue.id,
        );

        // Find when it moved to Done (Latest transition to Done)
        const doneRev = revisions.find(
          (r) => (r.snapshot as { status?: string })?.status === 'Done',
        );
        const doneTime = doneRev
          ? new Date(doneRev.createdAt)
          : new Date(issue.updatedAt);

        // Find Start Time (First transition to In Progress/Active)
        let startTime: Date | null = null;

        // Revisions are DESC. Iterate ASC to find first transition from Backlog/Todo
        const ascendingRevs = [...revisions].reverse();

        for (const rev of ascendingRevs) {
          const oldStatus = (rev.snapshot as { status?: string })?.status;
          if (
            (oldStatus === 'Backlog' || oldStatus === 'To Do' || !oldStatus) &&
            rev.action === 'UPDATE'
          ) {
            startTime = new Date(rev.createdAt);
            break;
          }
        }

        if (!startTime) {
          // Default 1 hour if valid history missing
          startTime = new Date(doneTime.getTime() - 1000 * 60 * 60);
        }

        const diffMs = doneTime.getTime() - startTime.getTime();
        const cycleTimeHours = diffMs / (1000 * 60 * 60);

        metrics.push({
          issueId: issue.id,
          issueTitle: issue.title,
          cycleTimeHours: Math.max(0, cycleTimeHours),
          completedAt: doneTime,
        });
      } catch (err: any) {
        this.logger.warn(
          `Failed to calc cycle time for issue ` + issue.id,
          err,
        );
      }
    }

    if (metrics.length === 0)
      return {
        averageDays: 0,
        totalIssues: 0,
        trend: 'flat',
        data: [],
        p50Days: 0,
        p85Days: 0,
        p95Days: 0,
      };

    // 3. Aggregate with Percentiles
    const sortedTimes = metrics
      .map((m) => m.cycleTimeHours)
      .sort((a, b) => a - b);
    const totalHours = metrics.reduce((sum, m) => sum + m.cycleTimeHours, 0);
    const averageHours = totalHours / metrics.length;
    const averageDays = parseFloat((averageHours / 24).toFixed(2));

    // Calculate percentiles
    const p50Hours = this.percentile(sortedTimes, 0.5);
    const p85Hours = this.percentile(sortedTimes, 0.85);
    const p95Hours = this.percentile(sortedTimes, 0.95);

    // 6. Calculate Trend (Compare with previous period)
    const previousStartDate = new Date();
    previousStartDate.setDate(previousStartDate.getDate() - daysLookback * 2);

    // REFACTOR: To avoid code duplication and heavy queries, we'll simplify the trend check.
    // If complex trend is needed, we should extract the calculation logic.
    // For now, let's implement a 'simple' trend based on the first half vs second half of the CURRENT period
    // if we don't want to fetch 2x data.
    // BUT the user asked for "Deep Analysis", so let's do it right.

    // Let's calculate previous period average properly.
    const pbAverage = await this.calculateAverageForPeriod(
      projectId,
      previousStartDate,
      new Date(Date.now() - daysLookback * 24 * 60 * 60 * 1000),
    );
    const trend =
      averageDays > pbAverage
        ? 'up'
        : averageDays < pbAverage
          ? 'down'
          : 'flat';

    return {
      averageDays,
      p50Days: parseFloat((p50Hours / 24).toFixed(2)),
      p85Days: parseFloat((p85Hours / 24).toFixed(2)),
      p95Days: parseFloat((p95Hours / 24).toFixed(2)),
      totalIssues: metrics.length,
      trend,
      data: usage === 'detailed' ? metrics : [],
    };
  }

  private async calculateAverageForPeriod(
    projectId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const issues: CycleTimeIssueRow[] = await this.dataSource.query(
      `
      SELECT id, title, status, "updatedAt"
      FROM issues
      WHERE "projectId" = $1
      AND status = 'Done'
      AND "updatedAt" > $2
      AND "updatedAt" <= $3
      `,
      [projectId, start, end],
    );

    if (issues.length === 0) return 0;

    let totalHours = 0;
    let count = 0;

    for (const issue of issues) {
      try {
        const revisions: Revision[] = await this.revisionsService.list(
          'Issue',
          issue.id,
        );

        // Find Done time
        const doneRev = revisions.find(
          (r) => (r.snapshot as { status?: string })?.status === 'Done',
        );
        const doneTime = doneRev
          ? new Date(doneRev.createdAt)
          : new Date(issue.updatedAt);

        // Find Start time
        let startTime: Date | null = null;
        const ascendingRevs = [...revisions].reverse();

        for (const rev of ascendingRevs) {
          const oldStatus = (rev.snapshot as { status?: string })?.status;
          if (
            (oldStatus === 'Backlog' || oldStatus === 'To Do' || !oldStatus) &&
            rev.action === 'UPDATE'
          ) {
            startTime = new Date(rev.createdAt);
            break;
          }
        }

        if (startTime) {
          const diffMs = doneTime.getTime() - startTime.getTime();
          totalHours += diffMs / (1000 * 60 * 60);
          count++;
        }
      } catch {
        // Ignore individual errors
      }
    }

    return count > 0 ? parseFloat((totalHours / count / 24).toFixed(2)) : 0;
  }

  /**
   * Calculate percentile value from sorted array
   */
  private percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0;
    const index = Math.ceil(sortedArr.length * p) - 1;
    return sortedArr[Math.max(0, index)];
  }
}

import { Injectable } from '@nestjs/common';
import { Revision } from '../../revisions/entities/revision.entity';
import type {
  CycleTimeIssueRow,
  CycleTimeMetric,
  CycleTimeSummaryResult,
} from '../interfaces/analytics.interfaces';

// ---------------------------------------------------------------------------
// Strict Interfaces (ZERO `any`)
// ---------------------------------------------------------------------------

/** Type-safe accessor for the JSONB snapshot's status field. */
interface RevisionStatusSnapshot {
  status?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 1000 * 60 * 60;
const HOURS_PER_DAY = 24;
const DEFAULT_FALLBACK_HOURS = 1;

/**
 * Pure cycle-time math — ZERO I/O, ZERO injected dependencies.
 *
 * SRP (Step 3): the percentile/trend/per-issue arithmetic extracted from the
 * former `CycleTimeService`. It operates exclusively on data the query service
 * has already fetched (issue rows + a pre-built revision Map), so it is fully
 * deterministic and trivially unit-testable without mocking a read model,
 * cache, or revision service. The query service owns all orchestration; this
 * class owns only the maths.
 */
@Injectable()
export class CycleTimeCalculator {
  /**
   * Compute cycle time for a single issue from its pre-fetched revisions.
   * Falls back to a 1-hour window when no start transition is found.
   */
  computeIssueCycleTime(
    issue: CycleTimeIssueRow,
    revisions: Revision[],
  ): CycleTimeMetric | null {
    const doneRev = revisions.find(
      (r) => (r.snapshot as RevisionStatusSnapshot)?.status === 'Done',
    );
    const doneTime = doneRev
      ? new Date(doneRev.createdAt)
      : new Date(issue.updatedAt);

    const startTime = this.findStartTime(revisions);

    const effectiveStart =
      startTime ??
      new Date(doneTime.getTime() - DEFAULT_FALLBACK_HOURS * MS_PER_HOUR);

    const diffMs = doneTime.getTime() - effectiveStart.getTime();
    const cycleTimeHours = diffMs / MS_PER_HOUR;

    return {
      issueId: issue.id,
      issueTitle: issue.title,
      cycleTimeHours: Math.max(0, cycleTimeHours),
      completedAt: doneTime,
    };
  }

  /**
   * Mean cycle time (days) for a trend-baseline window. Issues without a
   * detectable start transition are skipped (not defaulted) — matching the
   * stricter baseline semantics used for trend comparison.
   */
  averageDaysForPeriod(
    issues: CycleTimeIssueRow[],
    revisionMap: Map<string, Revision[]>,
  ): number {
    if (issues.length === 0) return 0;

    let totalHours = 0;
    let count = 0;

    for (const issue of issues) {
      try {
        const revisions = revisionMap.get(issue.id) ?? [];

        const doneRev = revisions.find(
          (r) => (r.snapshot as RevisionStatusSnapshot)?.status === 'Done',
        );
        const doneTime = doneRev
          ? new Date(doneRev.createdAt)
          : new Date(issue.updatedAt);

        const startTime = this.findStartTime(revisions);

        if (startTime) {
          const diffMs = doneTime.getTime() - startTime.getTime();
          totalHours += diffMs / MS_PER_HOUR;
          count++;
        }
      } catch {
        // Ignore individual errors — don't let one issue block the aggregate.
      }
    }

    return count > 0
      ? parseFloat((totalHours / count / HOURS_PER_DAY).toFixed(2))
      : 0;
  }

  /**
   * Aggregate per-issue metrics into the percentile summary + trend.
   * `previousAverageDays` is the trend baseline supplied by the caller.
   */
  summarize(
    metrics: CycleTimeMetric[],
    usage: 'summary' | 'detailed',
    previousAverageDays: number,
  ): CycleTimeSummaryResult {
    const sortedTimes = metrics
      .map((m) => m.cycleTimeHours)
      .sort((a, b) => a - b);
    const totalHours = metrics.reduce((sum, m) => sum + m.cycleTimeHours, 0);
    const averageHours = totalHours / metrics.length;
    const averageDays = parseFloat((averageHours / HOURS_PER_DAY).toFixed(2));

    const p50Hours = this.percentile(sortedTimes, 0.5);
    const p85Hours = this.percentile(sortedTimes, 0.85);
    const p95Hours = this.percentile(sortedTimes, 0.95);

    const trend: 'up' | 'down' | 'flat' =
      averageDays > previousAverageDays
        ? 'up'
        : averageDays < previousAverageDays
          ? 'down'
          : 'flat';

    return {
      averageDays,
      p50Days: parseFloat((p50Hours / HOURS_PER_DAY).toFixed(2)),
      p85Days: parseFloat((p85Hours / HOURS_PER_DAY).toFixed(2)),
      p95Days: parseFloat((p95Hours / HOURS_PER_DAY).toFixed(2)),
      totalIssues: metrics.length,
      trend,
      data: usage === 'detailed' ? metrics : [],
    };
  }

  /**
   * Find the first time an issue transitioned out of Backlog/To Do.
   */
  private findStartTime(revisions: Revision[]): Date | null {
    const ascendingRevs = [...revisions].reverse();

    for (const rev of ascendingRevs) {
      const oldStatus = (rev.snapshot as RevisionStatusSnapshot)?.status;
      if (
        (oldStatus === 'Backlog' || oldStatus === 'To Do' || !oldStatus) &&
        rev.action === 'UPDATE'
      ) {
        return new Date(rev.createdAt);
      }
    }

    return null;
  }

  /**
   * Calculate percentile value from a sorted array.
   */
  private percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0;
    const index = Math.ceil(sortedArr.length * p) - 1;
    return sortedArr[Math.max(0, index)];
  }
}

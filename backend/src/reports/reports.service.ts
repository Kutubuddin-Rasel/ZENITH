import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Issue,
  IssueStatus,
  IssueType,
} from 'src/issues/entities/issue.entity';
import { Sprint, SprintStatus } from 'src/sprints/entities/sprint.entity';
import { SprintIssue } from 'src/sprints/entities/sprint-issue.entity';
import { SprintsService } from 'src/sprints/sprints.service';

// Type interfaces for raw query results
interface VelocityAggregationRow {
  sprintId: string;
  committedPoints: string | number;
  completedPoints: string | number;
}

interface CumulativeFlowRow {
  date: Date | string;
  status: string;
  count: string | number;
}

interface EpicProgressRow {
  epicId: string;
  epicTitle: string;
  epicStatus: string;
  dueDate: Date | null;
  totalStories: string | number;
  completedStories: string | number;
  totalStoryPoints: string | number;
  completedStoryPoints: string | number;
}

interface BreakdownRow {
  type?: string;
  priority?: string;
  status?: string;
  assigneeName?: string;
  count: string | number;
}

import { CacheService } from 'src/cache/cache.service';

@Injectable()
export class ReportsService {
  constructor(
    private sprintsService: SprintsService,
    @InjectRepository(Issue)
    private issueRepo: Repository<Issue>,
    @InjectRepository(SprintIssue)
    private sprintIssueRepo: Repository<SprintIssue>,
    private cacheService: CacheService,
  ) {}

  /**
   * OPTIMIZED: Get velocity data for all completed sprints
   * Uses single aggregation query instead of N+1 queries
   */
  async getVelocity(projectId: string, _userId: string) {
    const cacheKey = `reports:velocity:${projectId}`;
    const cached = await this.cacheService.get(cacheKey);

    if (cached) return cached;

    // Get all completed sprints in single query
    const sprints = await this.sprintsService.findAll(projectId, _userId);
    const completedSprints = sprints.filter(
      (sprint) => sprint.status === SprintStatus.COMPLETED,
    );

    if (completedSprints.length === 0) {
      return [];
    }

    const sprintIds = completedSprints.map((s) => s.id);

    // OPTIMIZED: Single aggregation query for all sprints
    const velocityAggregation = await this.sprintIssueRepo
      .createQueryBuilder('si')
      .leftJoin('si.issue', 'issue')
      .select('si.sprintId', 'sprintId')
      .addSelect('COALESCE(SUM(issue.storyPoints), 0)', 'committedPoints')
      .addSelect(
        `COALESCE(SUM(CASE WHEN issue.status = :doneStatus THEN issue.storyPoints ELSE 0 END), 0)`,
        'completedPoints',
      )
      .where('si.sprintId IN (:...sprintIds)', { sprintIds })
      .setParameter('doneStatus', IssueStatus.DONE)
      .groupBy('si.sprintId')
      .getRawMany<VelocityAggregationRow>();

    // Create a map for O(1) lookup
    const aggregationMap = new Map(
      velocityAggregation.map((v) => [
        v.sprintId,
        {
          committedPoints: Number(v.committedPoints) || 0,
          completedPoints: Number(v.completedPoints) || 0,
        },
      ]),
    );

    // Build result with sprint metadata + aggregated data
    const velocityData = completedSprints.map((sprint) => {
      const agg = aggregationMap.get(sprint.id) || {
        committedPoints: 0,
        completedPoints: 0,
      };
      return {
        sprintId: sprint.id,
        sprintName: sprint.name,
        completedPoints: agg.completedPoints,
        committedPoints: agg.committedPoints,
        sprintStart: sprint.startDate,
        sprintEnd: sprint.endDate,
      };
    });

    const sortedVelocityData = velocityData.sort(
      (a, b) =>
        new Date(a.sprintStart).getTime() - new Date(b.sprintStart).getTime(),
    );

    await this.cacheService.set(cacheKey, sortedVelocityData, { ttl: 300 });
    return sortedVelocityData;
  }

  async getBurndown(projectId: string, userId: string, sprintId?: string) {
    let sprint: Sprint;
    let actualSprintId = sprintId;

    if (!actualSprintId) {
      // Default to first active
      const allSprints = await this.sprintsService.findAll(projectId, userId);
      const activeSprint = allSprints.find(
        (s) => s.status === SprintStatus.ACTIVE,
      );
      if (!activeSprint) return [];
      sprint = activeSprint;
      actualSprintId = activeSprint.id;
    } else {
      sprint = await this.sprintsService.findOne(
        projectId,
        actualSprintId,
        userId,
      );
    }

    if (!sprint) {
      return [];
    }

    // Query historical snapshots
    // Note: We need access to snapshotRepo.
    // Ideally ReportsService should have its own repo or access via SprintsService.
    // For now, let's assume we can inject snapshotRepo into ReportsService or add a method in SprintsService.
    // Let's add `getSnapshots(sprintId)` to SprintsService to keep it clean.

    // Changing approach: Call SprintsService to get history
    const snapshots = await this.sprintsService.getSprintSnapshots(sprint.id);

    // Map snapshots to chart format
    // If no snapshots exist (e.g. freshly created), we might want to return at least one point (today).

    const result = snapshots.map((snap) => ({
      date: snap.date,
      remainingPoints: snap.remainingPoints,
      completedPoints: snap.completedPoints,
      totalPoints: snap.totalPoints,
    }));

    // Add "Today" calculation as the last point if standard snapshots run at midnight
    // real-time check for "now"
    // (Implementation of real-time check omitted for brevity, relying on snapshots for trend)

    return result;
  }

  /**
   * OPTIMIZED: Cumulative flow using database aggregation
   */
  async getCumulativeFlow(projectId: string, _userId: string, days = 30) {
    const cacheKey = `reports:cfd:${projectId}:${days}`;
    const cached = await this.cacheService.get(cacheKey);

    if (cached) return cached;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // OPTIMIZED: Database-level aggregation by date and status
    const aggregation = await this.issueRepo
      .createQueryBuilder('issue')
      .select('DATE(issue.updatedAt)', 'date')
      .addSelect('issue.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('issue.updatedAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('issue.isArchived = :isArchived', { isArchived: false })
      .groupBy('DATE(issue.updatedAt)')
      .addGroupBy('issue.status')
      .orderBy('date', 'ASC')
      .getRawMany<CumulativeFlowRow>();

    // Transform to cumulative flow format
    const dateMap = new Map<string, Record<string, number>>();

    for (const row of aggregation) {
      const dateStr =
        row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : String(row.date);

      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, {});
      }
      dateMap.get(dateStr)![row.status] = Number(row.count) || 0;
    }

    // Initialize all statuses to 0 for consistency
    const allStatuses = Object.values(IssueStatus);
    const result = Array.from(dateMap.entries()).map(([date, statusCounts]) => {
      const dataPoint: Record<string, number | string> = { date };
      for (const status of allStatuses) {
        dataPoint[status] = statusCounts[status] || 0;
      }
      return dataPoint;
    });

    await this.cacheService.set(cacheKey, result, { ttl: 300 });
    return result;
  }

  /**
   * OPTIMIZED: Epic progress using single query with child aggregation
   */
  async getEpicProgress(projectId: string, _userId: string) {
    const cacheKey = `reports:epic-progress:${projectId}`;
    const cached = await this.cacheService.get(cacheKey);

    if (cached) return cached;

    void _userId; // userId reserved for future permission checks
    // Get epics with aggregated child data in single query
    const epicsWithProgress = await this.issueRepo
      .createQueryBuilder('epic')
      .leftJoin('epic.children', 'child')
      .select('epic.id', 'epicId')
      .addSelect('epic.title', 'epicTitle')
      .addSelect('epic.status', 'epicStatus')
      .addSelect('epic.dueDate', 'dueDate')
      .addSelect('COUNT(child.id)', 'totalStories')
      .addSelect(
        `SUM(CASE WHEN child.status = :doneStatus THEN 1 ELSE 0 END)`,
        'completedStories',
      )
      .addSelect('COALESCE(SUM(child.storyPoints), 0)', 'totalStoryPoints')
      .addSelect(
        `COALESCE(SUM(CASE WHEN child.status = :doneStatus THEN child.storyPoints ELSE 0 END), 0)`,
        'completedStoryPoints',
      )
      .where('epic.projectId = :projectId', { projectId })
      .andWhere('epic.type = :epicType', { epicType: IssueType.EPIC })
      .andWhere('epic.isArchived = :isArchived', { isArchived: false })
      .setParameter('doneStatus', IssueStatus.DONE)
      .groupBy('epic.id')
      .addGroupBy('epic.title')
      .addGroupBy('epic.status')
      .addGroupBy('epic.dueDate')
      .getRawMany<EpicProgressRow>();

    // Transform to response format
    return epicsWithProgress.map((row) => {
      const totalStories = Number(row.totalStories) || 0;
      const completedStories = Number(row.completedStories) || 0;
      const totalStoryPoints = Number(row.totalStoryPoints) || 0;
      const completedStoryPoints = Number(row.completedStoryPoints) || 0;

      return {
        epicId: row.epicId,
        epicTitle: row.epicTitle,
        epicStatus: row.epicStatus,
        totalStories,
        completedStories,
        totalStoryPoints,
        completedStoryPoints,
        completionPercentage:
          totalStories > 0 ? (completedStories / totalStories) * 100 : 0,
        storyPointsCompletionPercentage:
          totalStoryPoints > 0
            ? (completedStoryPoints / totalStoryPoints) * 100
            : 0,
        dueDate: row.dueDate,
      };
    });
  }

  /**
   * OPTIMIZED: Issue breakdown using parallel aggregation queries
   */
  async getIssueBreakdown(projectId: string, _userId: string) {
    const cacheKey = `reports:breakdown:${projectId}`;
    const cached = await this.cacheService.get(cacheKey);

    if (cached) return cached;

    void _userId; // userId reserved for future permission checks
    // Run all aggregation queries in parallel for maximum performance
    const [
      typeResult,
      priorityResult,
      statusResult,
      assigneeResult,
      totalCount,
    ] = await Promise.all([
      // Type breakdown
      this.issueRepo
        .createQueryBuilder('issue')
        .select('issue.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .where('issue.projectId = :projectId', { projectId })
        .andWhere('issue.isArchived = :isArchived', { isArchived: false })
        .groupBy('issue.type')
        .getRawMany<BreakdownRow>(),

      // Priority breakdown
      this.issueRepo
        .createQueryBuilder('issue')
        .select('issue.priority', 'priority')
        .addSelect('COUNT(*)', 'count')
        .where('issue.projectId = :projectId', { projectId })
        .andWhere('issue.isArchived = :isArchived', { isArchived: false })
        .groupBy('issue.priority')
        .getRawMany<BreakdownRow>(),

      // Status breakdown
      this.issueRepo
        .createQueryBuilder('issue')
        .select('issue.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('issue.projectId = :projectId', { projectId })
        .andWhere('issue.isArchived = :isArchived', { isArchived: false })
        .groupBy('issue.status')
        .getRawMany<BreakdownRow>(),

      // Assignee breakdown
      this.issueRepo
        .createQueryBuilder('issue')
        .leftJoin('issue.assignee', 'assignee')
        .select("COALESCE(assignee.name, 'Unassigned')", 'assigneeName')
        .addSelect('COUNT(*)', 'count')
        .where('issue.projectId = :projectId', { projectId })
        .andWhere('issue.isArchived = :isArchived', { isArchived: false })
        .groupBy("COALESCE(assignee.name, 'Unassigned')")
        .getRawMany<BreakdownRow>(),

      // Total count
      this.issueRepo.count({
        where: { projectId, isArchived: false },
      }),
    ]);

    // Transform to breakdown format
    const typeBreakdown: Record<string, number> = Object.fromEntries(
      typeResult.map((r) => [r.type!, Number(r.count)]),
    );
    const priorityBreakdown: Record<string, number> = Object.fromEntries(
      priorityResult.map((r) => [r.priority!, Number(r.count)]),
    );
    const statusBreakdown: Record<string, number> = Object.fromEntries(
      statusResult.map((r) => [r.status!, Number(r.count)]),
    );
    const assigneeBreakdown: Record<string, number> = Object.fromEntries(
      assigneeResult.map((r) => [r.assigneeName!, Number(r.count)]),
    );

    const result = {
      typeBreakdown, // FIX: Renamed from 'type' to match frontend interface
      priorityBreakdown, // FIX: Renamed from 'priority'
      statusBreakdown, // FIX: Renamed from 'status'
      assigneeBreakdown, // FIX: Renamed from 'assignee'
      totalIssues: totalCount, // FIX: Renamed from 'total'
    };

    await this.cacheService.set(cacheKey, result, { ttl: 300 });
    return result;
  }
}

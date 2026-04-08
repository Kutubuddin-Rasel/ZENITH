import { Injectable, Logger } from '@nestjs/common';
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
import { CacheService } from 'src/cache/cache.service';
import { TenantContext } from '../core/tenant/tenant-context.service';

// ---------------------------------------------------------------------------
// Strict Interfaces (ZERO `any`)
// ---------------------------------------------------------------------------

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

/** Exported velocity data point shape */
export interface VelocityDataPoint {
  sprintId: string;
  sprintName: string;
  completedPoints: number;
  committedPoints: number;
  sprintStart: Date | string;
  sprintEnd: Date | string;
}

/** Exported burndown data point shape */
export interface BurndownDataPoint {
  date: Date | string;
  remainingPoints: number;
  completedPoints: number;
  totalPoints: number;
}

/** Exported epic progress data shape */
export interface EpicProgressDataPoint {
  epicId: string;
  epicTitle: string;
  epicStatus: string;
  totalStories: number;
  completedStories: number;
  totalStoryPoints: number;
  completedStoryPoints: number;
  completionPercentage: number;
  storyPointsCompletionPercentage: number;
  dueDate: Date | null;
}

/** Exported issue breakdown shape */
export interface IssueBreakdownResult {
  typeBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  assigneeBreakdown: Record<string, number>;
  totalIssues: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly sprintsService: SprintsService,
    @InjectRepository(Issue)
    private readonly issueRepo: Repository<Issue>,
    @InjectRepository(SprintIssue)
    private readonly sprintIssueRepo: Repository<SprintIssue>,
    private readonly cacheService: CacheService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Helper: Get tenant ID with strict enforcement.
   * Throws if no tenant context — prevents accidental cross-tenant queries.
   */
  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error(
        'TenantContext is empty — refusing to execute report query without tenant scope.',
      );
    }
    return tenantId;
  }

  /**
   * OPTIMIZED: Get velocity data for all completed sprints.
   *
   * DEFENSE-IN-DEPTH:
   * issue.organizationId filter ensures tenant isolation at DB level,
   * independent of application-layer guards.
   */
  async getVelocity(
    projectId: string,
    _userId: string,
  ): Promise<VelocityDataPoint[]> {
    const cacheKey = `reports:velocity:${projectId}`;
    const cached = await this.cacheService.get<VelocityDataPoint[]>(cacheKey);

    if (cached) return cached;

    const tenantId = this.getTenantIdOrThrow();

    // Get all completed sprints
    const sprints = await this.sprintsService.findAll(projectId, _userId);
    const completedSprints = sprints.filter(
      (sprint) => sprint.status === SprintStatus.COMPLETED,
    );

    if (completedSprints.length === 0) {
      return [];
    }

    const sprintIds = completedSprints.map((s) => s.id);

    // OPTIMIZED: Single aggregation query for all sprints
    // DEFENSE-IN-DEPTH: issue.organizationId filter
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
      .andWhere('issue.organizationId = :tenantId', { tenantId })
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

    const velocityData: VelocityDataPoint[] = completedSprints.map((sprint) => {
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

  async getBurndown(
    projectId: string,
    userId: string,
    sprintId?: string,
  ): Promise<BurndownDataPoint[]> {
    let sprint: Sprint;
    let actualSprintId = sprintId;

    if (!actualSprintId) {
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

    // Burndown delegates to SprintsService which handles its own tenant isolation
    const snapshots = await this.sprintsService.getSprintSnapshots(sprint.id);

    return snapshots.map((snap) => ({
      date: snap.date,
      remainingPoints: snap.remainingPoints,
      completedPoints: snap.completedPoints,
      totalPoints: snap.totalPoints,
    }));
  }

  /**
   * OPTIMIZED: Cumulative flow using database aggregation.
   *
   * DEFENSE-IN-DEPTH:
   * issue.organizationId filter enforced at DB level.
   */
  async getCumulativeFlow(projectId: string, _userId: string, days = 30) {
    const cacheKey = `reports:cfd:${projectId}:${days}`;
    const cached = await this.cacheService.get(cacheKey);

    if (cached) return cached;

    const tenantId = this.getTenantIdOrThrow();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // DEFENSE-IN-DEPTH: issue.organizationId filter
    const aggregation = await this.issueRepo
      .createQueryBuilder('issue')
      .select('DATE(issue.updatedAt)', 'date')
      .addSelect('issue.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('issue.organizationId = :tenantId', { tenantId })
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
      const dateEntry = dateMap.get(dateStr);
      if (dateEntry) {
        dateEntry[row.status] = Number(row.count) || 0;
      }
    }

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
   * OPTIMIZED: Epic progress using single query with child aggregation.
   *
   * DEFENSE-IN-DEPTH:
   * epic.organizationId filter enforced at DB level.
   */
  async getEpicProgress(
    projectId: string,
    _userId: string,
  ): Promise<EpicProgressDataPoint[]> {
    const cacheKey = `reports:epic-progress:${projectId}`;
    const cached =
      await this.cacheService.get<EpicProgressDataPoint[]>(cacheKey);

    if (cached) return cached;

    const tenantId = this.getTenantIdOrThrow();

    // DEFENSE-IN-DEPTH: epic.organizationId filter
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
      .andWhere('epic.organizationId = :tenantId', { tenantId })
      .andWhere('epic.type = :epicType', { epicType: IssueType.EPIC })
      .andWhere('epic.isArchived = :isArchived', { isArchived: false })
      .setParameter('doneStatus', IssueStatus.DONE)
      .groupBy('epic.id')
      .addGroupBy('epic.title')
      .addGroupBy('epic.status')
      .addGroupBy('epic.dueDate')
      .getRawMany<EpicProgressRow>();

    const result: EpicProgressDataPoint[] = epicsWithProgress.map((row) => {
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

    await this.cacheService.set(cacheKey, result, { ttl: 300 });
    return result;
  }

  /**
   * OPTIMIZED: Issue breakdown using parallel aggregation queries.
   *
   * DEFENSE-IN-DEPTH:
   * issue.organizationId filter on ALL 5 parallel QueryBuilders.
   */
  async getIssueBreakdown(
    projectId: string,
    _userId: string,
  ): Promise<IssueBreakdownResult> {
    const cacheKey = `reports:breakdown:${projectId}`;
    const cached = await this.cacheService.get<IssueBreakdownResult>(cacheKey);

    if (cached) return cached;

    const tenantId = this.getTenantIdOrThrow();

    // Run all aggregation queries in parallel for maximum performance
    // DEFENSE-IN-DEPTH: every QB includes .andWhere('issue.organizationId = :tenantId')
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
        .andWhere('issue.organizationId = :tenantId', { tenantId })
        .andWhere('issue.isArchived = :isArchived', { isArchived: false })
        .groupBy('issue.type')
        .getRawMany<BreakdownRow>(),

      // Priority breakdown
      this.issueRepo
        .createQueryBuilder('issue')
        .select('issue.priority', 'priority')
        .addSelect('COUNT(*)', 'count')
        .where('issue.projectId = :projectId', { projectId })
        .andWhere('issue.organizationId = :tenantId', { tenantId })
        .andWhere('issue.isArchived = :isArchived', { isArchived: false })
        .groupBy('issue.priority')
        .getRawMany<BreakdownRow>(),

      // Status breakdown
      this.issueRepo
        .createQueryBuilder('issue')
        .select('issue.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('issue.projectId = :projectId', { projectId })
        .andWhere('issue.organizationId = :tenantId', { tenantId })
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
        .andWhere('issue.organizationId = :tenantId', { tenantId })
        .andWhere('issue.isArchived = :isArchived', { isArchived: false })
        .groupBy("COALESCE(assignee.name, 'Unassigned')")
        .getRawMany<BreakdownRow>(),

      // Total count (uses organization filter via QB for consistency)
      this.issueRepo
        .createQueryBuilder('issue')
        .where('issue.projectId = :projectId', { projectId })
        .andWhere('issue.organizationId = :tenantId', { tenantId })
        .andWhere('issue.isArchived = :isArchived', { isArchived: false })
        .getCount(),
    ]);

    const typeBreakdown: Record<string, number> = Object.fromEntries(
      typeResult.map((r) => [r.type ?? 'Unknown', Number(r.count)]),
    );
    const priorityBreakdown: Record<string, number> = Object.fromEntries(
      priorityResult.map((r) => [r.priority ?? 'Unknown', Number(r.count)]),
    );
    const statusBreakdown: Record<string, number> = Object.fromEntries(
      statusResult.map((r) => [r.status ?? 'Unknown', Number(r.count)]),
    );
    const assigneeBreakdown: Record<string, number> = Object.fromEntries(
      assigneeResult.map((r) => [r.assigneeName ?? 'Unknown', Number(r.count)]),
    );

    const result: IssueBreakdownResult = {
      typeBreakdown,
      priorityBreakdown,
      statusBreakdown,
      assigneeBreakdown,
      totalIssues: totalCount,
    };

    await this.cacheService.set(cacheKey, result, { ttl: 300 });
    return result;
  }
}

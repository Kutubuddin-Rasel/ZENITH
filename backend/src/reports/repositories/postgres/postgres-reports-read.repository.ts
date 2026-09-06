import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Issue,
  IssueStatus,
  IssueType,
} from 'src/issues/entities/issue.entity';
import { SprintIssue } from 'src/sprints/entities/sprint-issue.entity';
import { Project } from 'src/projects/entities/project.entity';
import type {
  IReportsReadModel,
  VelocityPointsAggregate,
  CumulativeFlowPoint,
  EpicProgressDataPoint,
  IssueBreakdownResult,
  SchedulableProject,
} from '../../interfaces/reports.interfaces';

// ---------------------------------------------------------------------------
// Raw projection rows (moved out of the legacy `ReportsService` in Step 2).
// These are persistence-shaped (string|number coercions from the driver) and
// stay PRIVATE to this file — every public method normalizes them into the
// dialect-free contract shapes before returning.
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

/**
 * Postgres implementation of the reports OLTP aggregation port.
 *
 * This class is the SOLE owner of raw `QueryBuilder` aggregations against the
 * live `Issue` / `SprintIssue` / `Project` tables for the reports module — the
 * only file permitted to import those entities. Concentrating every query here
 * keeps the Step-3 providers 100% persistence-free, and makes the read backend
 * swappable for a future `ClickHouseReportsReadRepository` (the planned OLAP
 * migration) behind `REPORTS_READ_MODEL_TOKEN` with NO upstream churn — exactly
 * the analytics OLAP/OLTP isolation pattern.
 *
 * TENANT MODEL: request-scoped reads take `organizationId` as an EXPLICIT
 * argument (the caller resolves it from CLS) and apply it as a defense-in-depth
 * `WHERE` filter — the contract on `IReportsReadModel` is dialect- and
 * CLS-free. `findActiveProjectsForScheduling` is the lone tenant-bypassing
 * read (the weekly cron sweep) and instead relies on the structural
 * non-archived / soft-delete filter.
 */
@Injectable()
export class PostgresReportsReadRepository implements IReportsReadModel {
  constructor(
    @InjectRepository(Issue)
    private readonly issueRepo: Repository<Issue>,
    @InjectRepository(SprintIssue)
    private readonly sprintIssueRepo: Repository<SprintIssue>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
  ) {}

  /**
   * Per-sprint committed/completed story-point rollup. Single GROUP BY across
   * all requested sprints (O(1) query, not N). Empty input short-circuits —
   * `IN (:...[])` is invalid SQL.
   */
  async getVelocityPoints(
    organizationId: string,
    sprintIds: readonly string[],
  ): Promise<readonly VelocityPointsAggregate[]> {
    if (sprintIds.length === 0) return [];

    const rows = await this.sprintIssueRepo
      .createQueryBuilder('si')
      .leftJoin('si.issue', 'issue')
      .select('si.sprintId', 'sprintId')
      .addSelect('COALESCE(SUM(issue.storyPoints), 0)', 'committedPoints')
      .addSelect(
        `COALESCE(SUM(CASE WHEN issue.status = :doneStatus THEN issue.storyPoints ELSE 0 END), 0)`,
        'completedPoints',
      )
      .where('si.sprintId IN (:...sprintIds)', { sprintIds: [...sprintIds] })
      .andWhere('issue.organizationId = :organizationId', { organizationId })
      .setParameter('doneStatus', IssueStatus.DONE)
      .groupBy('si.sprintId')
      .getRawMany<VelocityAggregationRow>();

    return rows.map((r) => ({
      sprintId: r.sprintId,
      committedPoints: Number(r.committedPoints) || 0,
      completedPoints: Number(r.completedPoints) || 0,
    }));
  }

  /**
   * Status counts per day over a trailing window, pivoted into one point per
   * date carrying every `IssueStatus` column (0-filled). The pivot is a pure
   * O(rows) Map fold — relocated verbatim from the legacy service.
   */
  async getCumulativeFlow(
    organizationId: string,
    projectId: string,
    days: number,
  ): Promise<readonly CumulativeFlowPoint[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const aggregation = await this.issueRepo
      .createQueryBuilder('issue')
      .select('DATE(issue.updatedAt)', 'date')
      .addSelect('issue.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('issue.organizationId = :organizationId', { organizationId })
      .andWhere('issue.updatedAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('issue.isArchived = :isArchived', { isArchived: false })
      .groupBy('DATE(issue.updatedAt)')
      .addGroupBy('issue.status')
      .orderBy('date', 'ASC')
      .getRawMany<CumulativeFlowRow>();

    const dateMap = new Map<string, Record<string, number>>();
    for (const row of aggregation) {
      const dateStr =
        row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : String(row.date);

      if (!dateMap.has(dateStr)) dateMap.set(dateStr, {});
      const entry = dateMap.get(dateStr);
      if (entry) entry[row.status] = Number(row.count) || 0;
    }

    const allStatuses = Object.values(IssueStatus);
    return Array.from(dateMap.entries()).map(([date, statusCounts]) => {
      const point: Record<string, number | string> = { date };
      for (const status of allStatuses) {
        point[status] = statusCounts[status] || 0;
      }
      return point as CumulativeFlowPoint;
    });
  }

  /**
   * Epic roll-up with child story/point completion + derived percentages.
   * One query with a child LEFT JOIN + GROUP BY (no N+1).
   */
  async getEpicProgress(
    organizationId: string,
    projectId: string,
  ): Promise<readonly EpicProgressDataPoint[]> {
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
      .andWhere('epic.organizationId = :organizationId', { organizationId })
      .andWhere('epic.type = :epicType', { epicType: IssueType.EPIC })
      .andWhere('epic.isArchived = :isArchived', { isArchived: false })
      .setParameter('doneStatus', IssueStatus.DONE)
      .groupBy('epic.id')
      .addGroupBy('epic.title')
      .addGroupBy('epic.status')
      .addGroupBy('epic.dueDate')
      .getRawMany<EpicProgressRow>();

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
   * Type/priority/status/assignee breakdown + total, via 5 parallel
   * aggregations (`Promise.all`). Every QB carries the `organizationId`
   * defense-in-depth filter.
   */
  async getIssueBreakdown(
    organizationId: string,
    projectId: string,
  ): Promise<IssueBreakdownResult> {
    const base = () =>
      this.issueRepo
        .createQueryBuilder('issue')
        .where('issue.projectId = :projectId', { projectId })
        .andWhere('issue.organizationId = :organizationId', { organizationId })
        .andWhere('issue.isArchived = :isArchived', { isArchived: false });

    const [
      typeResult,
      priorityResult,
      statusResult,
      assigneeResult,
      totalCount,
    ] = await Promise.all([
      base()
        .select('issue.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .groupBy('issue.type')
        .getRawMany<BreakdownRow>(),

      base()
        .select('issue.priority', 'priority')
        .addSelect('COUNT(*)', 'count')
        .groupBy('issue.priority')
        .getRawMany<BreakdownRow>(),

      base()
        .select('issue.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('issue.status')
        .getRawMany<BreakdownRow>(),

      base()
        .leftJoin('issue.assignee', 'assignee')
        .select("COALESCE(assignee.name, 'Unassigned')", 'assigneeName')
        .addSelect('COUNT(*)', 'count')
        .groupBy("COALESCE(assignee.name, 'Unassigned')")
        .getRawMany<BreakdownRow>(),

      base().getCount(),
    ]);

    const toMap = (
      rows: BreakdownRow[],
      key: keyof BreakdownRow,
    ): Record<string, number> =>
      Object.fromEntries(
        rows.map((r) => [String(r[key] ?? 'Unknown'), Number(r.count)]),
      );

    return {
      typeBreakdown: toMap(typeResult, 'type'),
      priorityBreakdown: toMap(priorityResult, 'priority'),
      statusBreakdown: toMap(statusResult, 'status'),
      assigneeBreakdown: toMap(assigneeResult, 'assigneeName'),
      totalIssues: totalCount,
    };
  }

  /**
   * Tenant-bypassing background read for the weekly cron sweep. Slim
   * projection (no large JSONB/audit columns); explicit raw aliases so the
   * keys match `SchedulableProject` exactly.
   */
  async findActiveProjectsForScheduling(): Promise<
    readonly SchedulableProject[]
  > {
    return this.projectRepo
      .createQueryBuilder('project')
      .select('project.id', 'id')
      .addSelect('project.name', 'name')
      .addSelect('project.organizationId', 'organizationId')
      .where('project.isArchived = :isArchived', { isArchived: false })
      .andWhere('project.deletedAt IS NULL')
      .getRawMany<SchedulableProject>();
  }
}

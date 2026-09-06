import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { IssueRepository } from '../../database/repositories/issue.repository';
import { RevisionRepository } from '../../database/repositories/revision.repository';
import { IssueStatus } from '../../issues/entities/issue.entity';

import { PROJECT_QUERY_TOKEN } from '../constants/projects.tokens';
import type {
  IProjectMetrics,
  IProjectQuery,
  ProjectActivityEntry,
  ProjectMetricsView,
} from '../interfaces/projects.interfaces';

/**
 * ProjectMetricsService
 *
 * Cached aggregations for the project summary + activity feed. Bound
 * to `PROJECT_METRICS_TOKEN`. Isolated from `IProjectQuery` so the
 * 5-minute summary cache can be invalidated without disturbing the
 * core read path.
 *
 * Cache key + invalidation
 * ------------------------
 * `project:{projectId}:summary` (TTL 300s), tagged with `project:{id}`
 * so command-side mutations on the project (rename, archive, delete)
 * can invalidate via the tag without knowing the summary key.
 *
 * Activity feed
 * -------------
 * Delegates to `RevisionRepository.findByProjectId`, which encapsulates
 * the JSONB path predicate and clamps the limit at 200 (BaseRepository
 * contract: callers MUST paginate large reads — enforced at the repo).
 */
@Injectable()
export class ProjectMetricsService implements IProjectMetrics {
  private static readonly SUMMARY_TTL_SECONDS = 300;
  private static readonly DEFAULT_ACTIVITY_LIMIT = 50;

  private readonly logger = new Logger(ProjectMetricsService.name);

  constructor(
    @Inject(PROJECT_QUERY_TOKEN)
    private readonly projects: IProjectQuery,
    private readonly issues: IssueRepository,
    private readonly revisions: RevisionRepository,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
  ) {}

  async getSummary(projectId: string): Promise<ProjectMetricsView> {
    const cacheKey = `project:${projectId}:summary`;
    const cached = await this.cacheStore.get<ProjectMetricsView>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const project = await this.projects.findById(projectId);

      const totalCount = await this.issues.count({ projectId });
      const doneCount = await this.issues.count({
        projectId,
        status: IssueStatus.DONE,
      });

      const rows = await this.issues.countByStatusForProject(projectId);
      const statusCounts: Record<string, number> = {};
      for (const row of rows) {
        statusCounts[row.status] = Number(row.count);
      }

      const percentDone =
        totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

      const summary: ProjectMetricsView = {
        projectId: project.id,
        projectName: project.name,
        totalIssues: totalCount,
        doneIssues: doneCount,
        percentDone,
        statusCounts,
      };

      await this.cacheStore.set(cacheKey, summary, {
        ttl: ProjectMetricsService.SUMMARY_TTL_SECONDS,
        tags: [`project:${projectId}`],
      });

      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to compute project summary for ${projectId}: ${message}`,
      );
      throw new BadRequestException(
        'Failed to compute project summary: ' + message,
      );
    }
  }

  async getActivity(
    projectId: string,
    limit = ProjectMetricsService.DEFAULT_ACTIVITY_LIMIT,
  ): Promise<readonly ProjectActivityEntry[]> {
    const rows = await this.revisions.findByProjectId(projectId, limit);
    return rows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      snapshot:
        (row.snapshot as Record<string, unknown> | null | undefined) ?? {},
      changedBy: row.changedBy,
      createdAt: row.createdAt,
    }));
  }
}

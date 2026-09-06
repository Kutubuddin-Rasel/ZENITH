import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SPRINT_QUERY_TOKEN,
  SprintStatus,
  type ISprintQuery,
  type SprintView,
} from 'src/sprints';
import { CACHE_STORE_TOKEN } from 'src/cache/constants/cache.tokens';
import type { ICacheStore } from 'src/cache/interfaces/cache.interfaces';
import {
  TENANT_CONTEXT_READER_TOKEN,
  type ITenantContextReader,
} from '../../core/tenant';
import { REPORTS_READ_MODEL_TOKEN } from '../constants/reports.tokens';
import type {
  IReportsReadModel,
  ReportRequestContext,
  VelocityDataPoint,
  BurndownDataPoint,
  CumulativeFlowPoint,
  EpicProgressDataPoint,
  IssueBreakdownResult,
} from '../interfaces/reports.interfaces';

const CACHE_TTL_SECONDS = 300;

/**
 * Reports read facade (CQRS query side).
 *
 * This is the QueryBuilder-free replacement for the legacy `ReportsService`
 * read methods. It owns exactly two cross-cutting concerns and NOTHING else:
 *
 *  1. **Caching** — under the legacy keys (`reports:velocity:*`, `reports:cfd:*`,
 *     `reports:epic-progress:*`, `reports:breakdown:*`) so warm production
 *     caches stay valid across the cutover. Burndown is intentionally
 *     uncached (it already delegates to the sprints aggregate's snapshots).
 *  2. **Tenant resolution** — `ctx.organizationId` (explicit; the BullMQ cron
 *     path supplies it from the job payload) falling back to the CLS
 *     `ITenantContextReader` (the HTTP path). This is the seam that makes the
 *     worker-thread report generation tenant-correct: the legacy CLS-only read
 *     would throw in a job with no request scope.
 *
 * Every aggregation is delegated to `REPORTS_READ_MODEL_TOKEN` (the
 * ClickHouse-swappable OLTP port) or `SPRINT_QUERY_TOKEN`. No entity, no raw
 * SQL, no `@InjectRepository` — the persistence boundary lives in the repo.
 *
 * Consumed by BOTH the controller's JSON read endpoints (raw domain shapes,
 * unchanged API) and the per-report data providers (which wrap these shapes
 * into the canonical `ReportTable`) — single source of truth, zero duplication.
 */
@Injectable()
export class ReportQueryService {
  private readonly logger = new Logger(ReportQueryService.name);

  constructor(
    @Inject(SPRINT_QUERY_TOKEN)
    private readonly sprints: ISprintQuery,
    @Inject(REPORTS_READ_MODEL_TOKEN)
    private readonly readModel: IReportsReadModel,
    @Inject(CACHE_STORE_TOKEN)
    private readonly cacheStore: ICacheStore,
    @Inject(TENANT_CONTEXT_READER_TOKEN)
    private readonly tenantContext: ITenantContextReader,
  ) {}

  /**
   * Velocity across ALL completed sprints (the regression guard — never the
   * trailing-5 truncation of `SPRINT_METRICS_TOKEN`). Sprint list + names/dates
   * come from `SPRINT_QUERY_TOKEN`; the per-sprint points rollup from the
   * reports-owned read model. Sorted ascending by sprint start.
   */
  async getVelocity(
    ctx: ReportRequestContext,
  ): Promise<readonly VelocityDataPoint[]> {
    const cacheKey = `reports:velocity:${ctx.projectId}`;
    const cached = await this.cacheStore.get<VelocityDataPoint[]>(cacheKey);
    if (cached) return cached;

    const organizationId = this.resolveOrg(ctx);

    const sprints = await this.sprints.findAll(ctx.projectId, ctx.userId);
    const completed = sprints.filter(
      (s) => s.status === SprintStatus.COMPLETED,
    );
    // Mirror legacy: empty result is returned WITHOUT populating the cache.
    if (completed.length === 0) return [];

    const points = await this.readModel.getVelocityPoints(
      organizationId,
      completed.map((s) => s.id),
    );
    const pointsBySprint = new Map(points.map((p) => [p.sprintId, p]));

    const data: VelocityDataPoint[] = completed.map((sprint: SprintView) => {
      const agg = pointsBySprint.get(sprint.id);
      return {
        sprintId: sprint.id,
        sprintName: sprint.name,
        committedPoints: agg?.committedPoints ?? 0,
        completedPoints: agg?.completedPoints ?? 0,
        sprintStart: sprint.startDate,
        sprintEnd: sprint.endDate,
      };
    });

    const sorted = data.sort(
      (a, b) =>
        new Date(a.sprintStart).getTime() - new Date(b.sprintStart).getTime(),
    );

    await this.cacheStore.set(cacheKey, sorted, { ttl: CACHE_TTL_SECONDS });
    return sorted;
  }

  /**
   * Burndown for a specific sprint (or the active one when omitted). Pure
   * sprints-aggregate reuse — `getSprintSnapshots` already carries
   * date/total/completed/remaining. Uncached, exactly as before.
   */
  async getBurndown(
    ctx: ReportRequestContext,
  ): Promise<readonly BurndownDataPoint[]> {
    let sprint: SprintView | undefined;

    if (ctx.sprintId) {
      sprint = await this.sprints.findOne(
        ctx.projectId,
        ctx.sprintId,
        ctx.userId,
      );
    } else {
      const all = await this.sprints.findAll(ctx.projectId, ctx.userId);
      sprint = all.find((s) => s.status === SprintStatus.ACTIVE);
    }

    if (!sprint) return [];

    const snapshots = await this.sprints.getSprintSnapshots(sprint.id);
    return snapshots.map((snap) => ({
      date: snap.date,
      remainingPoints: snap.remainingPoints,
      completedPoints: snap.completedPoints,
      totalPoints: snap.totalPoints,
    }));
  }

  /** Cumulative-flow points over a trailing window (default 30 days). */
  async getCumulativeFlow(
    ctx: ReportRequestContext,
  ): Promise<readonly CumulativeFlowPoint[]> {
    const days = ctx.days ?? 30;
    const cacheKey = `reports:cfd:${ctx.projectId}:${days}`;
    const cached = await this.cacheStore.get<CumulativeFlowPoint[]>(cacheKey);
    if (cached) return cached;

    const organizationId = this.resolveOrg(ctx);
    const result = await this.readModel.getCumulativeFlow(
      organizationId,
      ctx.projectId,
      days,
    );

    await this.cacheStore.set(cacheKey, result, { ttl: CACHE_TTL_SECONDS });
    return result;
  }

  /** Epic roll-up with derived completion percentages. */
  async getEpicProgress(
    ctx: ReportRequestContext,
  ): Promise<readonly EpicProgressDataPoint[]> {
    const cacheKey = `reports:epic-progress:${ctx.projectId}`;
    const cached = await this.cacheStore.get<EpicProgressDataPoint[]>(cacheKey);
    if (cached) return cached;

    const organizationId = this.resolveOrg(ctx);
    const result = await this.readModel.getEpicProgress(
      organizationId,
      ctx.projectId,
    );

    await this.cacheStore.set(cacheKey, result, { ttl: CACHE_TTL_SECONDS });
    return result;
  }

  /** Type/priority/status/assignee breakdown + total. */
  async getIssueBreakdown(
    ctx: ReportRequestContext,
  ): Promise<IssueBreakdownResult> {
    const cacheKey = `reports:breakdown:${ctx.projectId}`;
    const cached = await this.cacheStore.get<IssueBreakdownResult>(cacheKey);
    if (cached) return cached;

    const organizationId = this.resolveOrg(ctx);
    const result = await this.readModel.getIssueBreakdown(
      organizationId,
      ctx.projectId,
    );

    await this.cacheStore.set(cacheKey, result, { ttl: CACHE_TTL_SECONDS });
    return result;
  }

  /**
   * Explicit-org-wins tenant resolution. The cron/worker path supplies
   * `ctx.organizationId` from the job payload (no request scope); the HTTP path
   * leaves it undefined and we fall back to the CLS reader. Empty → throw, to
   * forbid an accidental cross-tenant scan.
   */
  private resolveOrg(ctx: ReportRequestContext): string {
    const organizationId =
      ctx.organizationId ?? this.tenantContext.getTenantId();
    if (!organizationId) {
      throw new Error(
        'TenantContext is empty — refusing to execute report query without tenant scope.',
      );
    }
    return organizationId;
  }
}

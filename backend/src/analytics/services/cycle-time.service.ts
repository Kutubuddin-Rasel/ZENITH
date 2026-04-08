import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RevisionsService } from '../../revisions/revisions.service';
import { Revision } from '../../revisions/entities/revision.entity';
import { TenantContext } from '../../core/tenant/tenant-context.service';
import { tenantJoin } from '../../core/database/safe-query.helper';
import { CacheService } from '../../cache/cache.service';

// ---------------------------------------------------------------------------
// Strict Interfaces (ZERO `any`)
// ---------------------------------------------------------------------------

export interface CycleTimeMetric {
  issueId: string;
  issueTitle: string;
  cycleTimeHours: number;
  completedAt: Date;
}

/** Projected row from the issues table query */
interface CycleTimeIssueRow {
  id: string;
  title: string;
  status: string;
  updatedAt: Date;
}

/** Type-safe accessor for the JSONB snapshot's status field */
interface RevisionStatusSnapshot {
  status?: string;
}

export interface CycleTimeSummaryResult {
  averageDays: number;
  p50Days: number;
  p85Days: number;
  p95Days: number;
  totalIssues: number;
  trend: 'up' | 'down' | 'flat';
  data: CycleTimeMetric[];
}

export interface CycleTimeEmptyResult {
  averageDays: 0;
  trend: 'flat';
  totalIssues: 0;
  data: [];
}

// ---------------------------------------------------------------------------
// Cache DTOs — Strict types for Redis JSON payloads
// ---------------------------------------------------------------------------

/**
 * Cache-safe version of CycleTimeMetric.
 *
 * SERIALIZATION NOTE:
 * JavaScript `Date` objects serialize to ISO strings via JSON.stringify().
 * We type `completedAt` as `string` here to make the serialization boundary
 * explicit — no silent Date→string coercion surprises on cache reads.
 *
 * Number precision: All percentiles use `parseFloat(x.toFixed(2))` which
 * produces IEEE 754 doubles that survive JSON round-trip losslessly.
 */
interface CachedCycleTimeMetric {
  issueId: string;
  issueTitle: string;
  cycleTimeHours: number;
  completedAt: string; // ISO 8601 string (Date survives JSON.stringify)
}

/**
 * Strict type for the Redis-cached cycle time payload.
 * This is what gets stored/retrieved from Redis.
 */
interface CachedCycleTimeResult {
  averageDays: number;
  p50Days: number;
  p85Days: number;
  p95Days: number;
  totalIssues: number;
  trend: 'up' | 'down' | 'flat';
  data: CachedCycleTimeMetric[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 1000 * 60 * 60;
const HOURS_PER_DAY = 24;
const DEFAULT_FALLBACK_HOURS = 1;

/**
 * Cache TTL in seconds. 5 minutes balances freshness with cost savings.
 * Analytics data changes slowly — recalculating every request is wasteful.
 */
const CACHE_TTL_SECONDS = 300;

/** Cache key namespace for analytics metrics */
const CACHE_NAMESPACE = 'analytics';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CycleTimeService {
  private readonly logger = new Logger(CycleTimeService.name);

  /**
   * In-memory Promise coalescing map for stampede prevention.
   *
   * CACHE STAMPEDE MITIGATION:
   * When TTL expires and 50 concurrent requests hit simultaneously,
   * only the FIRST request creates the calculation Promise and stores
   * it here. The remaining 49 requests find the pending Promise,
   * await it, and share the same result. After resolution, the entry
   * is removed.
   *
   * SCOPE: Per-process (not distributed). In multi-pod K8s, worst case
   * is N pods × 1 calculation each — acceptable vs N pods × 50 each.
   */
  private readonly inflightCalculations = new Map<
    string,
    Promise<CycleTimeSummaryResult | CycleTimeEmptyResult>
  >();

  constructor(
    private readonly dataSource: DataSource,
    private readonly revisionsService: RevisionsService,
    private readonly tenantContext: TenantContext,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Get cycle time metrics with caching + stampede prevention.
   *
   * Flow:
   * 1. Try cache → return immediately if hit
   * 2. Check inflight Map → await existing calculation if in-progress
   * 3. Calculate from DB → store in cache → return
   *
   * FAIL-OPEN: If Redis is down, degrades to direct DB calculation.
   */
  async calculateProjectCycleTime(
    projectId: string,
    usage: 'summary' | 'detailed' = 'summary',
    daysLookback = 30,
  ): Promise<CycleTimeSummaryResult | CycleTimeEmptyResult> {
    const cacheKey = `cycletime:${projectId}:${daysLookback}`;

    // -----------------------------------------------------------------------
    // Step 1: Try cache (fail-open)
    // -----------------------------------------------------------------------
    try {
      const cached = await this.cacheService.get<CachedCycleTimeResult>(
        cacheKey,
        { namespace: CACHE_NAMESPACE },
      );

      if (cached) {
        this.logger.debug(`Cache HIT for ${cacheKey}`);
        return this.hydrateCachedResult(cached, usage);
      }
    } catch (err: unknown) {
      // FAIL-OPEN: Redis error → fall through to DB calculation
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Cache read failed (fail-open): ${msg}`);
    }

    // -----------------------------------------------------------------------
    // Step 2: Check inflight calculation (stampede prevention)
    // -----------------------------------------------------------------------
    const inflightKey = `${cacheKey}:${usage}`;
    const inflight = this.inflightCalculations.get(inflightKey);
    if (inflight) {
      this.logger.debug(`Stampede coalesced: awaiting inflight ${inflightKey}`);
      return inflight;
    }

    // -----------------------------------------------------------------------
    // Step 3: First request — create, register, execute, cache, cleanup
    // -----------------------------------------------------------------------
    const calculationPromise = this.executeCalculation(
      projectId,
      usage,
      daysLookback,
      cacheKey,
    );

    // Register the inflight promise BEFORE awaiting
    this.inflightCalculations.set(inflightKey, calculationPromise);

    try {
      return await calculationPromise;
    } finally {
      // Always remove from inflight — success or failure
      this.inflightCalculations.delete(inflightKey);
    }
  }

  // ---------------------------------------------------------------------------
  // Core Calculation (extracted for stampede coalescing)
  // ---------------------------------------------------------------------------

  /**
   * Execute the actual cycle time calculation and cache the result.
   * This is the method that only ONE request per stampede window executes.
   */
  private async executeCalculation(
    projectId: string,
    usage: 'summary' | 'detailed',
    daysLookback: number,
    cacheKey: string,
  ): Promise<CycleTimeSummaryResult | CycleTimeEmptyResult> {
    const result = await this.computeCycleTime(projectId, usage, daysLookback);

    // Cache the result (fail-open — don't crash if Redis is down)
    try {
      await this.cacheService.set<CachedCycleTimeResult>(
        cacheKey,
        this.toCachePayload(result),
        { ttl: CACHE_TTL_SECONDS, namespace: CACHE_NAMESPACE },
      );
      this.logger.debug(
        `Cache SET for ${cacheKey} (TTL: ${CACHE_TTL_SECONDS}s)`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Cache write failed (fail-open): ${msg}`);
    }

    return result;
  }

  /**
   * Pure computation — no caching logic.
   *
   * SECURITY: Tenant-isolated via tenantJoin() on all raw queries.
   * PERFORMANCE: Uses batch revision fetching + Map<string, Revision[]>.
   */
  private async computeCycleTime(
    projectId: string,
    usage: 'summary' | 'detailed',
    daysLookback: number,
  ): Promise<CycleTimeSummaryResult | CycleTimeEmptyResult> {
    // 1. Fetch tenant-scoped 'Done' issues within the lookback period
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

    // 2. BATCH FETCH: Single query for all revisions (eliminates N+1)
    const issueIds = issues.map((issue) => issue.id);
    const revisionMap = await this.buildRevisionMap(issueIds);

    // 3. Calculate cycle time per issue using the in-memory Map
    const metrics: CycleTimeMetric[] = [];

    for (const issue of issues) {
      try {
        const revisions = revisionMap.get(issue.id) ?? [];
        const metric = this.computeIssueCycleTime(issue, revisions);
        if (metric) {
          metrics.push(metric);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(
          `Failed to calc cycle time for issue ${issue.id}: ${msg}`,
        );
      }
    }

    if (metrics.length === 0) {
      return {
        averageDays: 0,
        p50Days: 0,
        p85Days: 0,
        p95Days: 0,
        totalIssues: 0,
        trend: 'flat',
        data: [],
      };
    }

    // 4. Aggregate with Percentiles
    const sortedTimes = metrics
      .map((m) => m.cycleTimeHours)
      .sort((a, b) => a - b);
    const totalHours = metrics.reduce((sum, m) => sum + m.cycleTimeHours, 0);
    const averageHours = totalHours / metrics.length;
    const averageDays = parseFloat((averageHours / HOURS_PER_DAY).toFixed(2));

    const p50Hours = this.percentile(sortedTimes, 0.5);
    const p85Hours = this.percentile(sortedTimes, 0.85);
    const p95Hours = this.percentile(sortedTimes, 0.95);

    // 5. Calculate Trend (Compare with previous period)
    const previousStartDate = new Date();
    previousStartDate.setDate(previousStartDate.getDate() - daysLookback * 2);

    const pbAverage = await this.calculateAverageForPeriod(
      projectId,
      previousStartDate,
      new Date(Date.now() - daysLookback * HOURS_PER_DAY * MS_PER_HOUR),
    );

    const trend: 'up' | 'down' | 'flat' =
      averageDays > pbAverage
        ? 'up'
        : averageDays < pbAverage
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

  // ---------------------------------------------------------------------------
  // Cache Serialization Helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert live result to cache-safe payload.
   * Date objects → ISO strings for JSON serialization integrity.
   */
  private toCachePayload(
    result: CycleTimeSummaryResult | CycleTimeEmptyResult,
  ): CachedCycleTimeResult {
    return {
      averageDays: result.averageDays,
      p50Days: 'p50Days' in result ? result.p50Days : 0,
      p85Days: 'p85Days' in result ? result.p85Days : 0,
      p95Days: 'p95Days' in result ? result.p95Days : 0,
      totalIssues: result.totalIssues,
      trend: result.trend,
      data: result.data.map((m) => ({
        issueId: m.issueId,
        issueTitle: m.issueTitle,
        cycleTimeHours: m.cycleTimeHours,
        completedAt:
          m.completedAt instanceof Date
            ? m.completedAt.toISOString()
            : String(m.completedAt),
      })),
    };
  }

  /**
   * Hydrate cached payload back to live result type.
   * ISO strings → Date objects for downstream consumers.
   */
  private hydrateCachedResult(
    cached: CachedCycleTimeResult,
    usage: 'summary' | 'detailed',
  ): CycleTimeSummaryResult | CycleTimeEmptyResult {
    if (cached.totalIssues === 0) {
      return {
        averageDays: 0,
        trend: 'flat',
        totalIssues: 0,
        data: [],
      };
    }

    return {
      averageDays: cached.averageDays,
      p50Days: cached.p50Days,
      p85Days: cached.p85Days,
      p95Days: cached.p95Days,
      totalIssues: cached.totalIssues,
      trend: cached.trend,
      data:
        usage === 'detailed'
          ? cached.data.map((m) => ({
              issueId: m.issueId,
              issueTitle: m.issueTitle,
              cycleTimeHours: m.cycleTimeHours,
              completedAt: new Date(m.completedAt),
            }))
          : [],
    };
  }

  // ---------------------------------------------------------------------------
  // Trend Calculation (Tenant-Isolated)
  // ---------------------------------------------------------------------------

  /**
   * Calculate average cycle time for a date range (used for trend comparison).
   *
   * SECURITY FIX (Phase 1 — P0):
   * Previously missing tenantJoin() — cross-tenant data could leak into
   * trend calculations. Now enforced via INNER JOIN to projects table.
   *
   * PERFORMANCE FIX (Phase 2):
   * Uses batch listBatch() + Map<string, Revision[]> for O(1) lookups.
   */
  private async calculateAverageForPeriod(
    projectId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    // @RAW_QUERY_AUDIT: Tenant isolation enforced via tenantJoin()
    const issues: CycleTimeIssueRow[] = await this.dataSource.query(
      `
      SELECT i.id, i.title, i.status, i."updatedAt"
      FROM issues i
      ${tenantJoin('issues', 'i', this.tenantContext)}
      WHERE i."projectId" = $1
      AND i.status = 'Done'
      AND i."updatedAt" > $2
      AND i."updatedAt" <= $3
      `,
      [projectId, start, end],
    );

    if (issues.length === 0) return 0;

    // BATCH FETCH: Single query for all revisions (eliminates N+1)
    const issueIds = issues.map((issue) => issue.id);
    const revisionMap = await this.buildRevisionMap(issueIds);

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
        // Ignore individual errors — don't let one issue block the aggregate
      }
    }

    return count > 0
      ? parseFloat((totalHours / count / HOURS_PER_DAY).toFixed(2))
      : 0;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Build an in-memory Map<issueId, Revision[]> from batch-fetched revisions.
   */
  private async buildRevisionMap(
    issueIds: string[],
  ): Promise<Map<string, Revision[]>> {
    const allRevisions = await this.revisionsService.listBatch(
      'Issue',
      issueIds,
    );

    const revisionMap = new Map<string, Revision[]>();

    for (const revision of allRevisions) {
      const existing = revisionMap.get(revision.entityId);
      if (existing) {
        existing.push(revision);
      } else {
        revisionMap.set(revision.entityId, [revision]);
      }
    }

    return revisionMap;
  }

  /**
   * Compute cycle time for a single issue from its pre-fetched revisions.
   */
  private computeIssueCycleTime(
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
   * Calculate percentile value from sorted array.
   * Algorithm unchanged — core math preserved.
   */
  private percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0;
    const index = Math.ceil(sortedArr.length * p) - 1;
    return sortedArr[Math.max(0, index)];
  }
}

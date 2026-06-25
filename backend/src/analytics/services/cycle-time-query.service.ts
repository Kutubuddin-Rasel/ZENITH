import { Inject, Injectable, Logger } from '@nestjs/common';
import { RevisionsService } from '../../revisions/revisions.service';
import { Revision } from '../../revisions/entities/revision.entity';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { ANALYTICS_READ_MODEL_TOKEN } from '../constants/analytics.tokens';
import type {
  IAnalyticsReadModel,
  ICycleTimeQuery,
  CycleTimeMetric,
  CycleTimeSummaryResult,
  CycleTimeEmptyResult,
} from '../interfaces/analytics.interfaces';
import { CycleTimeCalculator } from './cycle-time.calculator';

// ---------------------------------------------------------------------------
// Cache DTOs — Strict types for Redis JSON payloads
// ---------------------------------------------------------------------------

/**
 * Cache-safe version of CycleTimeMetric.
 *
 * SERIALIZATION NOTE:
 * `Date` serializes to an ISO string via JSON.stringify(). We type
 * `completedAt` as `string` here to make the serialization boundary explicit
 * — no silent Date→string coercion surprises on cache reads.
 */
interface CachedCycleTimeMetric {
  issueId: string;
  issueTitle: string;
  cycleTimeHours: number;
  completedAt: string; // ISO 8601 string (Date survives JSON.stringify)
}

/** Strict type for the Redis-cached cycle time payload. */
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

/**
 * Cache TTL in seconds. 5 minutes balances freshness with cost savings.
 * Analytics data changes slowly — recalculating every request is wasteful.
 */
const CACHE_TTL_SECONDS = 300;

/** Cache key namespace for analytics metrics. */
const CACHE_NAMESPACE = 'analytics';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Cycle-time read surface (`ICycleTimeQuery`).
 *
 * SRP (Step 3): owns ONLY orchestration — cache fail-open, in-flight stampede
 * coalescing, revision-map assembly, and cache (de)serialization. All
 * arithmetic is delegated to the pure {@link CycleTimeCalculator}; all OLTP
 * access flows through the {@link IAnalyticsReadModel} port. The class speaks
 * neither SQL nor percentile maths.
 */
@Injectable()
export class CycleTimeQueryService implements ICycleTimeQuery {
  private readonly logger = new Logger(CycleTimeQueryService.name);

  /**
   * In-memory Promise coalescing map for stampede prevention.
   *
   * When TTL expires and N concurrent requests arrive, only the FIRST creates
   * the calculation Promise; the rest await the shared in-flight entry.
   * SCOPE: per-process (not distributed) — worst case in K8s is N pods × 1.
   */
  private readonly inflightCalculations = new Map<
    string,
    Promise<CycleTimeSummaryResult | CycleTimeEmptyResult>
  >();

  constructor(
    @Inject(ANALYTICS_READ_MODEL_TOKEN)
    private readonly readModel: IAnalyticsReadModel,
    private readonly revisionsService: RevisionsService,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
    private readonly calculator: CycleTimeCalculator,
  ) {}

  /**
   * Get cycle time metrics with caching + stampede prevention.
   *
   * Flow:
   * 1. Try cache → return immediately if hit
   * 2. Check inflight Map → await existing calculation if in-progress
   * 3. Calculate → store in cache → return
   *
   * FAIL-OPEN: If Redis is down, degrades to direct calculation.
   */
  async calculateProjectCycleTime(
    projectId: string,
    usage: 'summary' | 'detailed' = 'summary',
    daysLookback = 30,
  ): Promise<CycleTimeSummaryResult | CycleTimeEmptyResult> {
    const cacheKey = `cycletime:${projectId}:${daysLookback}`;

    // Step 1: Try cache (fail-open)
    try {
      const cached = await this.cacheStore.get<CachedCycleTimeResult>(
        cacheKey,
        { namespace: CACHE_NAMESPACE },
      );

      if (cached) {
        this.logger.debug(`Cache HIT for ${cacheKey}`);
        return this.hydrateCachedResult(cached, usage);
      }
    } catch (err: unknown) {
      // FAIL-OPEN: Redis error → fall through to calculation
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Cache read failed (fail-open): ${msg}`);
    }

    // Step 2: Check inflight calculation (stampede prevention)
    const inflightKey = `${cacheKey}:${usage}`;
    const inflight = this.inflightCalculations.get(inflightKey);
    if (inflight) {
      this.logger.debug(`Stampede coalesced: awaiting inflight ${inflightKey}`);
      return inflight;
    }

    // Step 3: First request — create, register, execute, cache, cleanup
    const calculationPromise = this.executeCalculation(
      projectId,
      usage,
      daysLookback,
      cacheKey,
    );

    this.inflightCalculations.set(inflightKey, calculationPromise);

    try {
      return await calculationPromise;
    } finally {
      this.inflightCalculations.delete(inflightKey);
    }
  }

  /**
   * Execute the calculation and cache the result. Only ONE request per
   * stampede window runs this.
   */
  private async executeCalculation(
    projectId: string,
    usage: 'summary' | 'detailed',
    daysLookback: number,
    cacheKey: string,
  ): Promise<CycleTimeSummaryResult | CycleTimeEmptyResult> {
    const result = await this.computeCycleTime(projectId, usage, daysLookback);

    try {
      await this.cacheStore.set<CachedCycleTimeResult>(
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
   * Orchestrate the calculation: fetch via the read-model port, assemble the
   * revision Map, then delegate per-issue + aggregate maths to the calculator.
   */
  private async computeCycleTime(
    projectId: string,
    usage: 'summary' | 'detailed',
    daysLookback: number,
  ): Promise<CycleTimeSummaryResult | CycleTimeEmptyResult> {
    // 1. Fetch tenant-scoped 'Done' issues (tenant isolation lives in the port).
    const issues = await this.readModel.findDoneIssuesForCycleTime(
      projectId,
      daysLookback,
    );

    if (issues.length === 0) {
      return { averageDays: 0, trend: 'flat', totalIssues: 0, data: [] };
    }

    // 2. BATCH FETCH: single query for all revisions (eliminates N+1).
    const revisionMap = await this.buildRevisionMap(issues.map((i) => i.id));

    // 3. Per-issue cycle time via the pure calculator.
    const metrics: CycleTimeMetric[] = [];
    for (const issue of issues) {
      try {
        const revisions = revisionMap.get(issue.id) ?? [];
        const metric = this.calculator.computeIssueCycleTime(issue, revisions);
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

    // 4. Trend baseline (previous equal-length window) + aggregate.
    const previousStartDate = new Date();
    previousStartDate.setDate(previousStartDate.getDate() - daysLookback * 2);
    const previousEndDate = new Date(
      Date.now() - daysLookback * HOURS_PER_DAY * MS_PER_HOUR,
    );

    const previousAverage = await this.computePreviousAverage(
      projectId,
      previousStartDate,
      previousEndDate,
    );

    return this.calculator.summarize(metrics, usage, previousAverage);
  }

  /**
   * Average cycle time (days) for the trend-baseline window. Reads the prior
   * period through the port; tenant isolation is enforced inside the impl.
   */
  private async computePreviousAverage(
    projectId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const issues = await this.readModel.findDoneIssuesInPeriod(
      projectId,
      start,
      end,
    );

    if (issues.length === 0) return 0;

    const revisionMap = await this.buildRevisionMap(issues.map((i) => i.id));
    return this.calculator.averageDaysForPeriod(issues, revisionMap);
  }

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

  // ---------------------------------------------------------------------------
  // Cache Serialization Helpers
  // ---------------------------------------------------------------------------

  /** Convert live result to cache-safe payload (Date → ISO string). */
  private toCachePayload(
    result: CycleTimeSummaryResult | CycleTimeEmptyResult,
  ): CachedCycleTimeResult {
    // `result.data` is the union `CycleTimeMetric[] | []`; calling `.map` on a
    // union of arrays with differing element types collapses the callback
    // param to `any`. Widen the empty-tuple arm to `CycleTimeMetric[]` (a
    // sound up-cast — `[]` ⊆ `CycleTimeMetric[]`) to restore element typing.
    const metrics: CycleTimeMetric[] = result.data;
    return {
      averageDays: result.averageDays,
      p50Days: 'p50Days' in result ? result.p50Days : 0,
      p85Days: 'p85Days' in result ? result.p85Days : 0,
      p95Days: 'p95Days' in result ? result.p95Days : 0,
      totalIssues: result.totalIssues,
      trend: result.trend,
      data: metrics.map((m) => ({
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

  /** Hydrate cached payload back to the live result type (ISO string → Date). */
  private hydrateCachedResult(
    cached: CachedCycleTimeResult,
    usage: 'summary' | 'detailed',
  ): CycleTimeSummaryResult | CycleTimeEmptyResult {
    if (cached.totalIssues === 0) {
      return { averageDays: 0, trend: 'flat', totalIssues: 0, data: [] };
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
}

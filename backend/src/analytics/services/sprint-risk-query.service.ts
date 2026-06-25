import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  SPRINT_QUERY_TOKEN,
  SPRINT_METRICS_TOKEN,
  type ISprintQuery,
  type ISprintMetrics,
} from '../../sprints';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import {
  ALERTS_QUEUE,
  ALERT_LOCK_PREFIX,
  ALERT_DEBOUNCE_TTL_SECONDS,
  RISK_ALERT_THRESHOLD,
  AlertJobData,
  AlertProviderType,
  AlertSeverity,
} from '../alerting/interfaces/alert.interfaces';
import type {
  ISprintRiskQuery,
  RiskFactor,
  SprintRiskResult,
} from '../interfaces/analytics.interfaces';

// ---------------------------------------------------------------------------
// Strict Interfaces (ZERO `any`)
// ---------------------------------------------------------------------------

interface Snapshot {
  totalPoints: number;
  completedPoints: number;
}

interface VelocityPoint {
  completedPoints: number;
}

/**
 * Cache-safe version of SprintRiskResult — only numbers/strings, so it
 * survives a JSON round-trip losslessly (no Date conversion needed).
 */
interface CachedSprintRiskResult {
  score: number;
  level: string;
  factors: RiskFactor[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache TTL in seconds. 5 minutes balances freshness with cost savings. */
const CACHE_TTL_SECONDS = 300;

/** Cache key namespace for analytics metrics. */
const CACHE_NAMESPACE = 'analytics';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Sprint-risk read surface (`ISprintRiskQuery`).
 *
 * Step 3 rename of the former `SprintRiskService` — already the module's clean
 * DIP exemplar (sprint data via `SPRINT_QUERY_TOKEN`/`SPRINT_METRICS_TOKEN`,
 * alerts via the `ALERTS_QUEUE` boundary). Now registered behind
 * `SPRINT_RISK_QUERY_TOKEN`; the cron aggregation job consumes that contract
 * instead of this concrete class.
 */
@Injectable()
export class SprintRiskQueryService implements ISprintRiskQuery {
  private readonly logger = new Logger(SprintRiskQueryService.name);

  /** In-memory Promise coalescing map for stampede prevention. */
  private readonly inflightCalculations = new Map<
    string,
    Promise<SprintRiskResult>
  >();

  constructor(
    @Inject(SPRINT_QUERY_TOKEN) private readonly sprintQuery: ISprintQuery,
    @Inject(SPRINT_METRICS_TOKEN)
    private readonly sprintMetrics: ISprintMetrics,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
    @InjectQueue(ALERTS_QUEUE) private readonly alertsQueue: Queue,
  ) {}

  /**
   * Get sprint risk score with caching + stampede prevention.
   *
   * Flow:
   * 1. Try cache → return immediately if hit
   * 2. Check inflight Map → await existing calculation if in-progress
   * 3. Calculate → store in cache → return
   * 4. If score > threshold → dispatch alert to BullMQ (fire-and-forget)
   *
   * FAIL-OPEN: If Redis is down, degrades to direct calculation.
   */
  async calculateSprintRisk(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<SprintRiskResult> {
    const cacheKey = `sprintrisk:${projectId}:${sprintId}`;

    // Step 1: Try cache (fail-open)
    try {
      const cached = await this.cacheStore.get<CachedSprintRiskResult>(
        cacheKey,
        { namespace: CACHE_NAMESPACE },
      );

      if (cached) {
        this.logger.debug(`Cache HIT for ${cacheKey}`);
        return cached;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Cache read failed (fail-open): ${msg}`);
    }

    // Step 2: Check inflight calculation (stampede prevention)
    const inflight = this.inflightCalculations.get(cacheKey);
    if (inflight) {
      this.logger.debug(`Stampede coalesced: awaiting inflight ${cacheKey}`);
      return inflight;
    }

    // Step 3: First request — create, register, execute, cache, cleanup
    const calculationPromise = this.executeCalculation(
      projectId,
      sprintId,
      userId,
      cacheKey,
    );

    this.inflightCalculations.set(cacheKey, calculationPromise);

    try {
      return await calculationPromise;
    } finally {
      this.inflightCalculations.delete(cacheKey);
    }
  }

  /** Execute the risk calculation, cache, and optionally alert. */
  private async executeCalculation(
    projectId: string,
    sprintId: string,
    userId: string,
    cacheKey: string,
  ): Promise<SprintRiskResult> {
    const result = await this.computeSprintRisk(projectId, sprintId, userId);

    // Only cache successful calculations (not error states).
    if (result.level !== 'Error') {
      try {
        await this.cacheStore.set<CachedSprintRiskResult>(cacheKey, result, {
          ttl: CACHE_TTL_SECONDS,
          namespace: CACHE_NAMESPACE,
        });
        this.logger.debug(
          `Cache SET for ${cacheKey} (TTL: ${CACHE_TTL_SECONDS}s)`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Cache write failed (fail-open): ${msg}`);
      }

      // Dispatch alert if risk exceeds threshold.
      if (result.score > RISK_ALERT_THRESHOLD) {
        await this.dispatchRiskAlert(projectId, sprintId, result);
      }
    }

    return result;
  }

  /**
   * Dispatch a high-risk alert to BullMQ (fire-and-forget) with a 24h debounce
   * lock to prevent alert fatigue. Dispatch failure NEVER crashes the flow.
   */
  private async dispatchRiskAlert(
    projectId: string,
    sprintId: string,
    result: SprintRiskResult,
  ): Promise<void> {
    const lockKey = `${ALERT_LOCK_PREFIX}:${sprintId}`;

    try {
      const existingLock = await this.cacheStore.get<string>(lockKey, {
        namespace: CACHE_NAMESPACE,
      });

      if (existingLock) {
        this.logger.debug(
          `Alert debounced for sprint ${sprintId} — lock exists`,
        );
        return;
      }

      // Set 24h debounce lock BEFORE dispatching to prevent race conditions.
      await this.cacheStore.set<string>(lockKey, 'locked', {
        ttl: ALERT_DEBOUNCE_TTL_SECONDS,
        namespace: CACHE_NAMESPACE,
      });

      const jobData: AlertJobData = {
        providers: [AlertProviderType.SLACK, AlertProviderType.PAGERDUTY],
        payload: {
          projectId,
          projectName: projectId, // Resolved by cron caller if available
          organizationId: '', // Populated by cron caller
          severity:
            result.score > 90 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
          title: 'Sprint Risk Alert — High Risk Detected',
          message: `Sprint risk score is *${result.score}/100* (${result.level}). Factors: ${result.factors.map((f) => `${f.name}: ${f.score}`).join(', ')}`,
          metricValue: result.score,
          threshold: RISK_ALERT_THRESHOLD,
          sprintId,
        },
        createdAt: new Date().toISOString(),
      };

      await this.alertsQueue.add('risk-alert', jobData, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 50,
        removeOnFail: false,
      });

      this.logger.log(
        `Alert dispatched for sprint ${sprintId} (score: ${result.score})`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to dispatch risk alert (non-blocking): ${msg}`);
    }
  }

  /**
   * Pure computation — no caching or alerting logic.
   *
   * Multi-factor sprint risk scoring:
   * - Scope Creep (30%): Points added vs initial scope
   * - Velocity Variance (30%): Current load vs average velocity
   * - Time Pressure (40%): Time elapsed vs work completed
   */
  private async computeSprintRisk(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<SprintRiskResult> {
    try {
      const [sprint, burndown, velocityData] = await Promise.all([
        this.sprintQuery.findOne(projectId, sprintId, userId),
        this.sprintMetrics.getBurndown(projectId, sprintId, userId) as Promise<{
          initialScope: number;
          snapshots: Snapshot[];
        }>,
        this.sprintMetrics.getVelocity(projectId, userId),
      ]);

      // Scope Creep Risk
      const initialPoints = Number(burndown.initialScope) || 1;
      const currentPoints =
        Number(
          burndown.snapshots[burndown.snapshots.length - 1]?.totalPoints,
        ) || initialPoints;
      const pointsAdded = Math.max(0, currentPoints - initialPoints);
      const scopeCreep = (pointsAdded / initialPoints) * 100;

      const scopeRiskRef: RiskFactor = {
        name: 'Scope Creep',
        score: Math.min(100, Math.round(scopeCreep * 2)),
        description: scopeCreep > 10 ? 'High scope expansion' : 'Stable scope',
      };

      // Velocity Risk
      const velocityHistory = velocityData.history;
      const avgVelocity =
        velocityHistory.reduce(
          (acc: number, v: VelocityPoint) => acc + Number(v.completedPoints),
          0,
        ) / (velocityHistory.length || 1);
      const velocityRiskScore =
        avgVelocity > 0 ? currentPoints / avgVelocity : 1.0;

      const velocityRiskRef: RiskFactor = {
        name: 'Velocity Variance',
        score: velocityRiskScore > 1.2 ? 100 : velocityRiskScore > 1.0 ? 50 : 0,
        description:
          velocityRiskScore > 1.1
            ? 'Overcommitted vs Velocity'
            : 'Commitment fits Velocity',
      };

      // Time Pressure
      const now = new Date();
      const start = new Date(sprint.startDate);
      const end = new Date(sprint.endDate);
      const totalDuration = end.getTime() - start.getTime();
      const elapsed = Math.max(0, now.getTime() - start.getTime());
      const timeProgress =
        totalDuration > 0 ? Math.min(1, elapsed / totalDuration) : 1;

      const completed =
        Number(
          burndown.snapshots[burndown.snapshots.length - 1]?.completedPoints,
        ) || 0;
      const workProgress =
        currentPoints > 0 ? Math.min(1, completed / currentPoints) : 1;

      const gap = timeProgress - workProgress;
      const timeRiskRef: RiskFactor = {
        name: 'Time Pressure',
        score: gap > 0.2 ? 90 : gap > 0.1 ? 50 : 10,
        description: gap > 0.1 ? 'Behind schedule' : 'On track',
      };

      const finalScore = Math.round(
        scopeRiskRef.score * 0.3 +
          velocityRiskRef.score * 0.3 +
          timeRiskRef.score * 0.4,
      );

      return {
        score: finalScore,
        level: finalScore > 75 ? 'High' : finalScore > 40 ? 'Medium' : 'Low',
        factors: [scopeRiskRef, velocityRiskRef, timeRiskRef],
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(`Failed to calculate sprint risk: ${msg}`);
      return { score: 0, level: 'Error', factors: [] };
    }
  }
}

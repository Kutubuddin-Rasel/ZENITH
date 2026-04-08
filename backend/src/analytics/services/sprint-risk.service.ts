import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SprintsService } from '../../sprints/sprints.service';
import { CacheService } from '../../cache/cache.service';
import {
  ALERTS_QUEUE,
  ALERT_LOCK_PREFIX,
  ALERT_DEBOUNCE_TTL_SECONDS,
  RISK_ALERT_THRESHOLD,
  AlertJobData,
  AlertProviderType,
  AlertSeverity,
} from '../alerting/interfaces/alert.interfaces';

// ---------------------------------------------------------------------------
// Strict Interfaces (ZERO `any`)
// ---------------------------------------------------------------------------

export interface RiskFactor {
  name: string;
  score: number; // 0-100, where 100 is high risk
  description: string;
}

interface Snapshot {
  totalPoints: number;
  completedPoints: number;
}

interface VelocityPoint {
  completedPoints: number;
}

export interface SprintRiskResult {
  score: number;
  level: string;
  factors: RiskFactor[];
}

// ---------------------------------------------------------------------------
// Cache DTO — Strict type for Redis JSON payload
// ---------------------------------------------------------------------------

/**
 * Cache-safe version of SprintRiskResult.
 *
 * SERIALIZATION NOTE:
 * SprintRiskResult contains only numbers and strings — survives
 * JSON round-trip losslessly. No Date conversion needed.
 */
interface CachedSprintRiskResult {
  score: number;
  level: string;
  factors: RiskFactor[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Cache TTL in seconds. 5 minutes balances freshness with cost savings.
 * Sprint risk involves multiple SprintsService calls — expensive to
 * recalculate on every request.
 */
const CACHE_TTL_SECONDS = 300;

/** Cache key namespace for analytics metrics */
const CACHE_NAMESPACE = 'analytics';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class SprintRiskService {
  private readonly logger = new Logger(SprintRiskService.name);

  /**
   * In-memory Promise coalescing map for stampede prevention.
   */
  private readonly inflightCalculations = new Map<
    string,
    Promise<SprintRiskResult>
  >();

  constructor(
    private readonly sprintsService: SprintsService,
    private readonly cacheService: CacheService,
    @InjectQueue(ALERTS_QUEUE) private readonly alertsQueue: Queue,
  ) {}

  /**
   * Get sprint risk score with caching + stampede prevention.
   *
   * Flow:
   * 1. Try cache → return immediately if hit
   * 2. Check inflight Map → await existing calculation if in-progress
   * 3. Calculate from DB → store in cache → return
   * 4. If score > 80 → dispatch alert to BullMQ (fire-and-forget)
   *
   * FAIL-OPEN: If Redis is down, degrades to direct DB calculation.
   */
  async calculateSprintRisk(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<SprintRiskResult> {
    const cacheKey = `sprintrisk:${projectId}:${sprintId}`;

    // -----------------------------------------------------------------------
    // Step 1: Try cache (fail-open)
    // -----------------------------------------------------------------------
    try {
      const cached = await this.cacheService.get<CachedSprintRiskResult>(
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

    // -----------------------------------------------------------------------
    // Step 2: Check inflight calculation (stampede prevention)
    // -----------------------------------------------------------------------
    const inflight = this.inflightCalculations.get(cacheKey);
    if (inflight) {
      this.logger.debug(`Stampede coalesced: awaiting inflight ${cacheKey}`);
      return inflight;
    }

    // -----------------------------------------------------------------------
    // Step 3: First request — create, register, execute, cache, cleanup
    // -----------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Core Calculation (extracted for stampede coalescing)
  // ---------------------------------------------------------------------------

  /**
   * Execute the actual risk calculation, cache, and optionally alert.
   */
  private async executeCalculation(
    projectId: string,
    sprintId: string,
    userId: string,
    cacheKey: string,
  ): Promise<SprintRiskResult> {
    const result = await this.computeSprintRisk(projectId, sprintId, userId);

    // Only cache successful calculations (not error states)
    if (result.level !== 'Error') {
      try {
        await this.cacheService.set<CachedSprintRiskResult>(cacheKey, result, {
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

      // PHASE 5: Dispatch alert if risk exceeds threshold
      if (result.score > RISK_ALERT_THRESHOLD) {
        await this.dispatchRiskAlert(projectId, sprintId, result);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Phase 5: Alert Dispatch with Debounce
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a high-risk alert to BullMQ (fire-and-forget).
   *
   * DEBOUNCE (24h Lock):
   * Uses CacheService to store `alert_sent_lock:{sprintId}` with 24h TTL.
   * If lock exists → skip (already alerted today).
   * If lock absent → set lock + add job to queue.
   *
   * This prevents alert fatigue:
   * - Monday: risk = 0.85 → ALERT SENT, lock set for 24h
   * - Tuesday: risk = 0.86 → lock found → SKIPPED
   * - Wednesday: lock expired → risk = 0.82 → ALERT SENT again
   *
   * ASYNC: queue.add() writes to Redis (~1ms). Does NOT block cron.
   */
  private async dispatchRiskAlert(
    projectId: string,
    sprintId: string,
    result: SprintRiskResult,
  ): Promise<void> {
    const lockKey = `${ALERT_LOCK_PREFIX}:${sprintId}`;

    try {
      // Check debounce lock
      const existingLock = await this.cacheService.get<string>(lockKey, {
        namespace: CACHE_NAMESPACE,
      });

      if (existingLock) {
        this.logger.debug(
          `Alert debounced for sprint ${sprintId} — lock exists`,
        );
        return;
      }

      // Set 24h debounce lock BEFORE dispatching to prevent race conditions
      await this.cacheService.set<string>(lockKey, 'locked', {
        ttl: ALERT_DEBOUNCE_TTL_SECONDS,
        namespace: CACHE_NAMESPACE,
      });

      // Dispatch to BullMQ (fire-and-forget)
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
      // Alert dispatch failure must NEVER crash the calculation flow
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to dispatch risk alert (non-blocking): ${msg}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Risk Computation
  // ---------------------------------------------------------------------------

  /**
   * Pure computation — no caching or alerting logic.
   *
   * Multi-factor sprint risk scoring:
   * - Scope Creep (30% weight): Points added vs initial scope
   * - Velocity Variance (30% weight): Current load vs average velocity
   * - Time Pressure (40% weight): Time elapsed vs work completed
   */
  private async computeSprintRisk(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<SprintRiskResult> {
    try {
      // 1. Fetch Sprint & Burndown & Velocity
      const [sprint, burndown, velocityData] = await Promise.all([
        this.sprintsService.findOne(projectId, sprintId, userId),
        this.sprintsService.getBurndown(
          projectId,
          sprintId,
          userId,
        ) as Promise<{ initialScope: number; snapshots: Snapshot[] }>,
        this.sprintsService.getVelocity(projectId, userId),
      ]);

      // 2. Scope Creep Risk
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

      // 3. Velocity Risk
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

      // 4. Time Pressure
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

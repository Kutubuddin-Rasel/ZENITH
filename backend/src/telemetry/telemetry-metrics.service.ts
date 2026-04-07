import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

// =============================================================================
// METRIC NAME ENUM (Strict Typing — No Magic Strings)
// =============================================================================

/**
 * All telemetry-specific Prometheus metric names as an enum.
 * Prevents typos and enables IDE autocompletion.
 */
export enum TelemetryMetricNames {
  HEARTBEATS_TOTAL = 'zenith_telemetry_heartbeats_total',
  ACTIVE_SESSIONS = 'zenith_telemetry_active_sessions',
  PROCESSING_DURATION = 'zenith_telemetry_processing_duration_seconds',
  AUTO_TRANSITIONS = 'zenith_telemetry_auto_transitions_total',
}

/**
 * Label names for the heartbeat counter.
 * Kept intentionally minimal to avoid cardinality explosion.
 */
type HeartbeatLabelNames = 'status';
type TransitionLabelNames = 'result';

// =============================================================================
// TELEMETRY METRICS SERVICE
// =============================================================================

/**
 * TelemetryMetricsService — Domain-Specific Prometheus Metrics
 *
 * ARCHITECTURE:
 * Uses the global prom-client registry (same as MetricsService in CommonModule).
 * All metrics are automatically exposed at the existing `/metrics` endpoint
 * via MetricsController — no additional wiring needed.
 *
 * METRICS:
 * 1. zenith_telemetry_heartbeats_total     (Counter)   — Total heartbeats received
 * 2. zenith_telemetry_active_sessions      (Gauge)     — Current active sessions in Redis
 * 3. zenith_telemetry_processing_duration  (Histogram) — Worker processing latency
 * 4. zenith_telemetry_auto_transitions     (Counter)   — Auto-transitions triggered
 *
 * CARDINALITY:
 * Labels are intentionally minimal (status: queued|failed, result: success|skipped|error).
 * No userId/ticketId labels — those would create millions of time-series.
 *
 * ZERO `any` TOLERANCE.
 */
@Injectable()
export class TelemetryMetricsService implements OnModuleInit {
  private readonly logger = new Logger(TelemetryMetricsService.name);

  // ---------------------------------------------------------------------------
  // Metric Instances
  // ---------------------------------------------------------------------------

  private readonly heartbeatsCounter: Counter<HeartbeatLabelNames>;
  private readonly activeSessionsGauge: Gauge<string>;
  private readonly processingDuration: Histogram<string>;
  private readonly autoTransitionsCounter: Counter<TransitionLabelNames>;

  /** In-memory session counter — updated by the processor */
  private activeSessionCount = 0;

  constructor() {
    // =========================================================================
    // COUNTER: Total heartbeats received by the API
    // =========================================================================
    this.heartbeatsCounter = new Counter<HeartbeatLabelNames>({
      name: TelemetryMetricNames.HEARTBEATS_TOTAL,
      help: 'Total number of telemetry heartbeats received',
      labelNames: ['status'],
      registers: [register],
    });

    // =========================================================================
    // GAUGE: Active tracked sessions (on-demand from Redis via collect())
    // =========================================================================
    this.activeSessionsGauge = new Gauge<string>({
      name: TelemetryMetricNames.ACTIVE_SESSIONS,
      help: 'Number of currently active telemetry sessions in Redis',
      registers: [register],
      // collect() is called on-demand when Prometheus scrapes /metrics.
      // Uses an in-memory counter maintained by the processor
      // (more efficient than Redis SCAN which is O(N) per scrape).
      collect: () => {
        try {
          this.activeSessionsGauge.set(this.activeSessionCount);
        } catch {
          // If Redis is down, report 0 (fail-open for metrics)
          this.activeSessionsGauge.set(0);
        }
      },
    });

    // =========================================================================
    // HISTOGRAM: Worker processing latency
    // Buckets tuned for fast Redis + occasional DB operations:
    //   1-10ms   → Redis session lookup
    //   50-250ms → DB issue lookup + status update
    //   1-5s     → Slow/degraded operations
    // =========================================================================
    this.processingDuration = new Histogram<string>({
      name: TelemetryMetricNames.PROCESSING_DURATION,
      help: 'Telemetry heartbeat processing duration in seconds',
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5],
      registers: [register],
    });

    // =========================================================================
    // COUNTER: Auto-transitions triggered by telemetry
    // =========================================================================
    this.autoTransitionsCounter = new Counter<TransitionLabelNames>({
      name: TelemetryMetricNames.AUTO_TRANSITIONS,
      help: 'Total number of ticket auto-transitions triggered by telemetry',
      labelNames: ['result'],
      registers: [register],
    });
  }

  onModuleInit(): void {
    this.logger.log(
      'Telemetry Prometheus metrics registered: ' +
        `${TelemetryMetricNames.HEARTBEATS_TOTAL}, ` +
        `${TelemetryMetricNames.ACTIVE_SESSIONS}, ` +
        `${TelemetryMetricNames.PROCESSING_DURATION}, ` +
        `${TelemetryMetricNames.AUTO_TRANSITIONS}`,
    );
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /** Increment heartbeat counter when a heartbeat is queued */
  recordHeartbeatQueued(): void {
    this.heartbeatsCounter.inc({ status: 'queued' });
  }

  /** Increment heartbeat counter when queuing fails */
  recordHeartbeatFailed(): void {
    this.heartbeatsCounter.inc({ status: 'failed' });
  }

  /** Observe processing duration (call from worker) */
  observeProcessingDuration(durationSeconds: number): void {
    this.processingDuration.observe(durationSeconds);
  }

  /** Start a histogram timer — returns a function that records the duration */
  startProcessingTimer(): () => number {
    return this.processingDuration.startTimer();
  }

  /** Record an auto-transition result */
  recordAutoTransition(result: 'success' | 'skipped' | 'error'): void {
    this.autoTransitionsCounter.inc({ result });
  }

  // ===========================================================================
  // SESSION COUNTER (Managed by Processor)
  // ===========================================================================

  /** Called by processor when a new session is created */
  incrementActiveSession(): void {
    this.activeSessionCount++;
  }

  /** Called by processor when a session expires (TTL) or is cleaned up */
  decrementActiveSession(): void {
    if (this.activeSessionCount > 0) {
      this.activeSessionCount--;
    }
  }
}

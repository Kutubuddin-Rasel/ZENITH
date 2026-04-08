import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  TelemetryAggregationService,
  TelemetryBufferEntry,
  RotatedBatchResult,
} from './telemetry-aggregation.service';
import {
  TelemetryDailyMetric,
  TelemetryMetricType,
} from './entities/telemetry-daily-metric.entity';
import { TelemetryMetricsService } from './telemetry-metrics.service';

// =============================================================================
// JOB PAYLOAD TYPES
// =============================================================================

/** Payload for the flush-aggregates repeatable job */
interface FlushJobPayload {
  /** Override date to flush (default: today). Format: YYYY-MM-DD */
  date?: string;
}

/** Payload for the prune-old-metrics repeatable job */
interface PruneJobPayload {
  /** Retention period in days (default: 90) */
  retentionDays?: number;
}

// =============================================================================
// TELEMETRY FLUSH PROCESSOR
// =============================================================================

/**
 * TelemetryFlushProcessor — Atomic Batch Flush with DLQ
 *
 * ARCHITECTURE:
 * This processor handles two repeatable jobs:
 *
 * 1. `flush-aggregates` (every 5 minutes):
 *    a. RENAME active keys → frozen namespace (atomic per-key)
 *    b. Read from frozen keys (isolated — live traffic is unaffected)
 *    c. Bulk upsert to PostgreSQL
 *    d. ONLY on PG success: UNLINK frozen keys + DECRBY buffer counter
 *    e. On final retry exhaustion: log CRITICAL, cleanup frozen keys (graceful data drop)
 *
 * 2. `prune-old-metrics` (daily at 03:00 UTC):
 *    - DELETE rows older than retention period
 *
 * MULTI-POD SAFETY:
 * - BullMQ repeatable jobs: exactly-one execution per cycle
 * - Each job uses its own batchId (from BullMQ job ID) for key isolation
 * - If a job retries, it reuses the same batchId → processes the same frozen keys
 *
 * ZERO `any` TOLERANCE.
 */
@Processor('telemetry-flush')
export class TelemetryFlushProcessor extends WorkerHost {
  private readonly logger = new Logger(TelemetryFlushProcessor.name);
  private readonly retentionDays: number;

  constructor(
    private readonly aggregationService: TelemetryAggregationService,
    @InjectRepository(TelemetryDailyMetric)
    private readonly metricsRepository: Repository<TelemetryDailyMetric>,
    private readonly configService: ConfigService,
    private readonly telemetryMetrics: TelemetryMetricsService,
  ) {
    super();
    this.retentionDays = this.configService.get<number>(
      'TELEMETRY_RETENTION_DAYS',
      90,
    );
  }

  async process(
    job: Job<FlushJobPayload | PruneJobPayload, void, string>,
  ): Promise<void> {
    switch (job.name) {
      case 'flush-aggregates':
        return this.handleFlush(job);
      case 'prune-old-metrics':
        return this.handlePrune(job.data as PruneJobPayload);
      default:
        this.logger.warn(`Unknown flush job: ${job.name}`);
    }
  }

  // ===========================================================================
  // FLUSH: Atomic Rotate → Read → Upsert → Cleanup
  // ===========================================================================

  private async handleFlush(
    job: Job<FlushJobPayload | PruneJobPayload, void, string>,
  ): Promise<void> {
    const data = job.data as FlushJobPayload;
    const date = data.date || new Date().toISOString().slice(0, 10);
    const batchId = job.id || `fallback-${Date.now()}`;
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 5);

    this.logger.debug(
      `Flush attempt ${job.attemptsMade + 1} for date=${date} batch=${batchId}`,
    );

    // =========================================================================
    // PHASE 1: Atomically rotate active keys → frozen namespace
    // New heartbeats will instantly create fresh active keys.
    // =========================================================================
    let batch: RotatedBatchResult;
    try {
      batch = await this.aggregationService.rotateAndRead(date, batchId);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Rotate-and-read failed: ${errMsg}`);
      throw error; // BullMQ retries
    }

    if (batch.entries.length === 0) {
      this.logger.debug(`No aggregates to flush for ${date}`);
      return;
    }

    // =========================================================================
    // PHASE 2: Bulk upsert to PostgreSQL
    // =========================================================================
    try {
      await this.bulkUpsert(batch.entries, date);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Bulk upsert failed for batch=${batchId}: ${errMsg}`);

      if (isLastAttempt) {
        // =====================================================================
        // DLQ: Final retry exhausted. PostgreSQL is unreachable.
        //
        // DECISION: Gracefully drop telemetry data to prevent Redis bloat.
        // Telemetry is analytics data (not financial) — losing 5 min of
        // heartbeat counts is acceptable. Keeping frozen keys forever
        // would exhaust Redis memory, which is NOT acceptable.
        //
        // LOG CRITICAL so PagerDuty/CloudWatch alarm triggers.
        // =====================================================================
        this.logger.error(
          `🔴 CRITICAL: Telemetry flush DLQ triggered. ` +
            `Dropping ${batch.entries.length} aggregates for batch=${batchId} ` +
            `after ${job.attemptsMade + 1} attempts. ` +
            `PostgreSQL may be down. Data is lost.`,
        );

        // Fire Prometheus metric — dashboards/alerts can react
        this.telemetryMetrics.recordFlushFailure();

        // Clean up frozen keys to prevent Redis memory bloat
        await this.aggregationService.deleteProcessedBatch(
          batch.frozenKeys,
          batch.entityCount,
        );

        return; // Don't rethrow — job completes (failed data is dropped)
      }

      throw error; // Retry with the same batchId
    }

    // =========================================================================
    // PHASE 3: Cleanup ONLY after successful PG write
    // Frozen keys are safe to delete now — data is persisted.
    // =========================================================================
    await this.aggregationService.deleteProcessedBatch(
      batch.frozenKeys,
      batch.entityCount,
    );

    this.logger.log(
      `Flushed ${batch.entries.length} aggregates for batch=${batchId}`,
    );
  }

  /**
   * Bulk upsert aggregated telemetry into PostgreSQL.
   *
   * Uses INSERT ... ON CONFLICT (org, project, type, date) DO UPDATE
   * for idempotent writes.
   */
  private async bulkUpsert(
    entries: TelemetryBufferEntry[],
    date: string,
  ): Promise<void> {
    const metricsToUpsert: Partial<TelemetryDailyMetric>[] = [];

    for (const entry of entries) {
      if (entry.heartbeats > 0) {
        metricsToUpsert.push({
          organizationId: entry.organizationId,
          projectId: entry.projectId,
          metricType: TelemetryMetricType.HEARTBEAT_COUNT,
          value: entry.heartbeats,
          metricDate: date,
        });
      }

      if (entry.uniqueUsers > 0) {
        metricsToUpsert.push({
          organizationId: entry.organizationId,
          projectId: entry.projectId,
          metricType: TelemetryMetricType.UNIQUE_USERS,
          value: entry.uniqueUsers,
          metricDate: date,
        });
      }

      if (entry.transitions > 0) {
        metricsToUpsert.push({
          organizationId: entry.organizationId,
          projectId: entry.projectId,
          metricType: TelemetryMetricType.AUTO_TRANSITIONS,
          value: entry.transitions,
          metricDate: date,
        });
      }
    }

    if (metricsToUpsert.length === 0) return;

    await this.metricsRepository
      .createQueryBuilder()
      .insert()
      .into(TelemetryDailyMetric)
      .values(metricsToUpsert)
      .orUpdate(
        ['value', 'updatedAt'],
        ['organizationId', 'projectId', 'metricType', 'metricDate'],
      )
      .execute();

    this.logger.log(
      `Upserted ${metricsToUpsert.length} metric rows for ${date}`,
    );
  }

  // ===========================================================================
  // PRUNE: Delete old metrics beyond retention period
  // ===========================================================================

  private async handlePrune(data: PruneJobPayload): Promise<void> {
    const retentionDays = data.retentionDays || this.retentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);

    try {
      const result = await this.metricsRepository
        .createQueryBuilder()
        .delete()
        .from(TelemetryDailyMetric)
        .where('metricDate < :cutoff', { cutoff: cutoffDateStr })
        .execute();

      const deletedCount = result.affected || 0;
      this.logger.log(
        `Pruned ${deletedCount} telemetry metrics older than ${cutoffDateStr} ` +
          `(retention: ${retentionDays} days)`,
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Prune failed: ${errMsg}`);
      throw error;
    }
  }
}

import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { TelemetryProcessor } from './telemetry.processor';
import { TelemetryMetricsService } from './telemetry-metrics.service';
import { TelemetryAggregationService } from './telemetry-aggregation.service';
import { TelemetryFlushProcessor } from './telemetry-flush.processor';
import { TelemetryAnalyticsService } from './telemetry-analytics.service';
import { TelemetryDailyMetric } from './entities/telemetry-daily-metric.entity';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { IssuesModule } from '../issues/issues.module';

// =============================================================================
// TELEMETRY MODULE
// =============================================================================

/**
 * ARCHITECTURE:
 *
 * Heartbeat Flow:
 *   Controller → TelemetryService → BullMQ(telemetry) → TelemetryProcessor
 *     ↳ writes to Redis session (CacheService)
 *     ↳ buffers aggregates in Redis (TelemetryAggregationService)
 *     ↳ may auto-transition tickets (IssuesService)
 *
 * Persistence Flow (every 5 min):
 *   BullMQ(telemetry-flush) → TelemetryFlushProcessor
 *     ↳ drains Redis buffers (TelemetryAggregationService)
 *     ↳ bulk upserts to PostgreSQL (TelemetryDailyMetric)
 *
 * Pruning Flow (daily 03:00 UTC):
 *   BullMQ(telemetry-flush) → TelemetryFlushProcessor
 *     ↳ deletes rows older than retention period
 *
 * Analytics Flow:
 *   Controller → TelemetryAnalyticsService → PostgreSQL query
 */
@Module({
  imports: [
    ApiKeysModule,
    IssuesModule,
    TypeOrmModule.forFeature([TelemetryDailyMetric]),
    BullModule.registerQueue(
      { name: 'telemetry' },
      { name: 'telemetry-flush' },
    ),
  ],
  controllers: [TelemetryController],
  providers: [
    TelemetryService,
    TelemetryProcessor,
    TelemetryMetricsService,
    TelemetryAggregationService,
    TelemetryFlushProcessor,
    TelemetryAnalyticsService,
  ],
  exports: [TelemetryService, TelemetryMetricsService],
})
export class TelemetryModule implements OnModuleInit {
  private readonly logger = new Logger(TelemetryModule.name);

  constructor(
    @InjectQueue('telemetry-flush')
    private readonly flushQueue: Queue,
  ) {}

  /**
   * Register BullMQ repeatable jobs on module init.
   *
   * BullMQ repeatable jobs are pod-safe — only one instance runs per cycle
   * across the entire cluster (Redis-based deduplication).
   */
  async onModuleInit(): Promise<void> {
    try {
      // =====================================================================
      // FLUSH AGGREGATES: every 5 minutes
      // Drains Redis buffers → PostgreSQL bulk upsert
      // =====================================================================
      await this.flushQueue.upsertJobScheduler(
        'flush-aggregates-scheduler',
        { every: 5 * 60 * 1000 }, // 5 minutes
        {
          name: 'flush-aggregates',
          data: {},
          opts: {
            removeOnComplete: true,
            removeOnFail: 100, // Keep last 100 failed jobs for debugging
            attempts: 5,
            backoff: { type: 'exponential', delay: 30000 }, // 30s, 60s, 120s, 240s, 480s ≈ 15 min
          },
        },
      );
      this.logger.log('Registered flush-aggregates repeatable job (every 5m)');

      // =====================================================================
      // PRUNE OLD METRICS: daily at 03:00 UTC
      // Deletes rows beyond retention period (default: 90 days)
      // =====================================================================
      await this.flushQueue.upsertJobScheduler(
        'prune-old-metrics-scheduler',
        { pattern: '0 3 * * *' }, // Cron: daily at 03:00 UTC
        {
          name: 'prune-old-metrics',
          data: {},
          opts: {
            removeOnComplete: true,
            removeOnFail: 50,
            attempts: 3,
            backoff: { type: 'exponential', delay: 10000 },
          },
        },
      );
      this.logger.log(
        'Registered prune-old-metrics repeatable job (daily 03:00 UTC)',
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to register repeatable jobs: ${errMsg}`);
    }
  }
}

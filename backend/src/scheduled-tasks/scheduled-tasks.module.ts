/**
 * Scheduled Tasks Module
 *
 * ARCHITECTURE:
 * This module manages data lifecycle operations (project purge, future cleanup jobs).
 * It uses BullMQ repeatable jobs instead of @Cron() for multi-pod safety.
 *
 * WHY BullMQ OVER @Cron():
 * @Cron() fires on EVERY pod simultaneously. For destructive operations
 * (cascade deletion of 15+ related tables), concurrent execution causes:
 * - Database transaction deadlocks
 * - Massive IOPS spikes
 * - Potential data corruption
 *
 * BullMQ repeatable jobs guarantee exactly-one execution per scheduled cycle
 * across all pods via Redis-based deduplication.
 *
 * PATTERN:
 * Module (OnModuleInit) → upsertJobScheduler() → Redis stores schedule
 * Redis creates job per cycle → @Processor worker picks it up (one pod only)
 *
 * @see TelemetryModule for the established convention.
 */

import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ProjectPurgeProcessor } from './purge.processor';
import {
  PROJECT_PURGE_QUEUE,
  PROJECT_PURGE_SCHEDULER_ID,
  PURGE_JOB_NAME,
  PURGE_CRON_PATTERN,
  PURGE_MAX_ATTEMPTS,
  PURGE_BACKOFF_DELAY_MS,
  PurgeJobPayload,
} from './purge.constants';

@Module({
  imports: [
    // Register queue locally (same pattern as TelemetryModule).
    // Not in CoreQueueModule because no other module consumes this queue.
    BullModule.registerQueue({ name: PROJECT_PURGE_QUEUE }),
  ],
  providers: [ProjectPurgeProcessor],
  exports: [],
})
export class ScheduledTasksModule implements OnModuleInit {
  private readonly logger = new Logger(ScheduledTasksModule.name);

  constructor(
    @InjectQueue(PROJECT_PURGE_QUEUE)
    private readonly purgeQueue: Queue<PurgeJobPayload>,
  ) {}

  /**
   * Register the project purge repeatable job on module initialization.
   *
   * `upsertJobScheduler()` is idempotent — if the scheduler already exists
   * in Redis (registered by another pod), this call updates it without
   * creating duplicates.
   *
   * MULTI-POD BEHAVIOR:
   * - Pod A starts → calls upsertJobScheduler() → scheduler created in Redis
   * - Pod B starts → calls upsertJobScheduler() → scheduler already exists, no-op
   * - Redis creates one job per cron cycle (daily 03:00 UTC)
   * - One pod's @Processor worker picks the job (atomic BRPOPLPUSH)
   * - Other pods' workers are idle for this cycle
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.purgeQueue.upsertJobScheduler(
        PROJECT_PURGE_SCHEDULER_ID,
        { pattern: PURGE_CRON_PATTERN }, // Daily at 03:00 UTC
        {
          name: PURGE_JOB_NAME,
          data: {} as PurgeJobPayload,
          opts: {
            removeOnComplete: true,
            removeOnFail: 50, // Keep last 50 failed jobs for debugging
            attempts: PURGE_MAX_ATTEMPTS,
            backoff: {
              type: 'exponential',
              delay: PURGE_BACKOFF_DELAY_MS,
            },
          },
        },
      );

      this.logger.log(
        `Registered project purge repeatable job (${PURGE_CRON_PATTERN})`,
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to register project purge repeatable job: ${errMsg}`,
      );
    }
  }
}

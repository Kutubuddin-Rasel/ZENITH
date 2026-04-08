import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AlertingService } from '../alerting.service';
import { ALERTS_QUEUE, AlertJobData } from '../interfaces/alert.interfaces';

// ---------------------------------------------------------------------------
// BullMQ Alerts Processor
// ---------------------------------------------------------------------------

/**
 * AlertsProcessor — BullMQ worker that consumes alert jobs.
 *
 * ARCHITECTURE:
 * This runs in a separate worker context from the main event loop.
 * Sprint-risk cron adds jobs to the queue (~1ms Redis write) and
 * continues immediately. This processor handles the slow HTTP calls
 * to Slack/PagerDuty asynchronously.
 *
 * RETRY: Inherits CoreQueueModule defaults (3 attempts, exp backoff)
 * plus job-level overrides (5 attempts, 2s base delay).
 *
 * FAILURE: If all attempts exhausted, job moves to 'failed' state
 * in Redis for manual review. Does NOT block the cron scheduler.
 */
@Processor(ALERTS_QUEUE)
export class AlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertsProcessor.name);

  constructor(private readonly alertingService: AlertingService) {
    super();
  }

  /**
   * Process an alert job.
   *
   * Extracts provider targets and payload from the job data,
   * delegates to AlertingService.dispatch().
   *
   * If dispatch throws (all providers failed), BullMQ auto-retries
   * with exponential backoff.
   */
  async process(job: Job<AlertJobData>): Promise<void> {
    this.logger.log(
      `Processing alert job ${job.id} — attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 5}`,
    );

    const { providers, payload } = job.data;

    try {
      await this.alertingService.dispatch(providers, payload);

      this.logger.log(
        `Alert job ${job.id} completed — project: ${payload.projectId}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Alert job ${job.id} failed: ${msg}`);

      // Re-throw to trigger BullMQ retry
      throw err;
    }
  }
}

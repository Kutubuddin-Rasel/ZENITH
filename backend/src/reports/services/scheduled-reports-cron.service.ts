import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { REPORTS_READ_MODEL_TOKEN } from '../constants/reports.tokens';
import { getISOWeekIdentifier } from '../utils/iso-week.util';
import type {
  IReportsReadModel,
  SchedulableProject,
  ReportType,
  ReportFormat,
} from '../interfaces/reports.interfaces';
import {
  SCHEDULED_REPORTS_QUEUE,
  DEFAULT_REPORT_FORMATS,
  DEFAULT_REPORT_TYPES,
  IScheduledReportJob,
  buildJobId,
} from '../interfaces/scheduled-report.interfaces';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * System service account user ID for scheduled report queries.
 * Reports run outside request context — no real user session.
 * This ID must correspond to a system account in the users table.
 */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * ScheduledReportsCronService — Weekly Report Dispatcher
 *
 * ARCHITECTURE:
 * This is the THIN cron layer. It does NOT generate reports, and it no longer
 * touches the database directly — the active-project sweep is delegated to the
 * reports-owned read port (`REPORTS_READ_MODEL_TOKEN`), the only surface
 * allowed to query the `Project` table on behalf of reports. It dispatches
 * BullMQ jobs to the `scheduled-reports-queue`; the heavy work (export + S3
 * upload) happens in `ScheduledReportsProcessor` running in a worker thread.
 *
 * IDEMPOTENCY:
 * Each job gets a deterministic ID: `scheduled-report:{projectId}:{year}-W{week}:{format}`
 * where the week is a correct ISO-8601 (Thursday-rule) identifier — see
 * `getISOWeekIdentifier`. BullMQ silently ignores `queue.add()` if a job with
 * the same ID already exists, preventing duplicate generations when:
 * - The cron fires twice (pod restart during execution window)
 * - Multiple pods run the same cron (missing distributed lock)
 *
 * SCALABILITY:
 * Dispatching is a Redis write (~1ms per job). The queue distributes
 * processing across available worker threads.
 */
@Injectable()
export class ScheduledReportsCronService {
  private readonly logger = new Logger(ScheduledReportsCronService.name);

  constructor(
    @Inject(REPORTS_READ_MODEL_TOKEN)
    private readonly readModel: IReportsReadModel,
    @InjectQueue(SCHEDULED_REPORTS_QUEUE)
    private readonly scheduledReportsQueue: Queue,
  ) {}

  /**
   * Weekly report generation — Every Monday at 8:00 AM.
   *
   * CRON: '0 8 * * 1'
   *   0 = minute 0
   *   8 = hour 8 (8 AM)
   *   * = any day of month
   *   * = any month
   *   1 = Monday
   */
  @Cron('0 8 * * 1', { name: 'weekly-report-generation' })
  async dispatchWeeklyReports(): Promise<void> {
    this.logger.log('Weekly report generation started');

    const weekIdentifier = getISOWeekIdentifier();
    const activeProjects =
      await this.readModel.findActiveProjectsForScheduling();

    this.logger.log(
      `Found ${activeProjects.length} active projects for week ${weekIdentifier}`,
    );

    let dispatched = 0;
    let skipped = 0;

    for (const project of activeProjects) {
      // Skip projects without an organization (impossible in prod, defense-in-depth)
      if (!project.organizationId) {
        this.logger.warn(
          `Project ${project.id} has no organizationId — skipping`,
        );
        skipped++;
        continue;
      }

      for (const reportType of DEFAULT_REPORT_TYPES) {
        for (const format of DEFAULT_REPORT_FORMATS) {
          const submitted = await this.dispatchJob(
            project,
            reportType,
            format,
            weekIdentifier,
          );
          if (submitted) {
            dispatched++;
          } else {
            skipped++;
          }
        }
      }
    }

    this.logger.log(
      `Weekly report dispatch complete: ${dispatched} dispatched, ${skipped} skipped`,
    );
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a single report job to BullMQ with deterministic ID.
   * Returns true if job was submitted, false if it already existed.
   */
  private async dispatchJob(
    project: SchedulableProject,
    reportType: ReportType,
    format: ReportFormat,
    weekIdentifier: string,
  ): Promise<boolean> {
    const jobId = buildJobId(project.id, weekIdentifier, format);

    try {
      const jobData: IScheduledReportJob = {
        projectId: project.id,
        organizationId: project.organizationId,
        projectName: project.name,
        reportType,
        format,
        weekIdentifier,
        userId: SYSTEM_USER_ID,
      };

      await this.scheduledReportsQueue.add('generate-report', jobData, {
        jobId, // Deterministic — BullMQ deduplicates automatically
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: false,
      });

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to dispatch report job ${jobId}: ${msg}`);
      return false;
    }
  }
}

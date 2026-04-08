import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Queue } from 'bullmq';
import { Project } from '../../projects/entities/project.entity';
import {
  SCHEDULED_REPORTS_QUEUE,
  DEFAULT_REPORT_FORMATS,
  DEFAULT_REPORT_TYPES,
  IScheduledReportJob,
  ScheduledReportFormat,
  ScheduledReportType,
  buildJobId,
} from '../interfaces/scheduled-report.interfaces';

// ---------------------------------------------------------------------------
// Strict Types (ZERO `any`)
// ---------------------------------------------------------------------------

/** Slim project projection for cron dispatch — no large text columns */
interface ActiveProjectRow {
  id: string;
  name: string;
  organizationId: string;
}

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
 * This is the THIN cron layer. It does NOT generate reports.
 * It queries active projects and dispatches BullMQ jobs to the
 * `scheduled-reports-queue`. The heavy work (export + S3 upload)
 * happens in `ScheduledReportsProcessor` running in a worker thread.
 *
 * IDEMPOTENCY:
 * Each job gets a deterministic ID: `scheduled-report:{projectId}:{year}-W{week}:{format}`
 * BullMQ silently ignores `queue.add()` if a job with the same ID
 * already exists. This prevents duplicate generations if:
 * - The cron fires twice (pod restart during execution window)
 * - Multiple pods run the same cron (missing distributed lock)
 *
 * SCALABILITY:
 * Dispatching is a Redis write (~1ms per job). For 500 projects:
 * 500 projects × 2 report types × 1 format = 1000 jobs in ~1 second.
 * The queue distributes processing across available worker threads.
 */
@Injectable()
export class ScheduledReportsCronService {
  private readonly logger = new Logger(ScheduledReportsCronService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
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

    const weekIdentifier = this.getISOWeekIdentifier();
    const activeProjects = await this.getActiveProjects();

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
   * Query active (non-archived, non-deleted) projects.
   *
   * SLIM READ: Only selects `id`, `name`, `organizationId` — no description,
   * no templateConfig (large JSONB), no audit fields.
   */
  private async getActiveProjects(): Promise<ActiveProjectRow[]> {
    return this.projectRepo
      .createQueryBuilder('project')
      .select(['project.id', 'project.name', 'project.organizationId'])
      .where('project.isArchived = :isArchived', { isArchived: false })
      .andWhere('project.deletedAt IS NULL')
      .getRawMany<ActiveProjectRow>();
  }

  /**
   * Dispatch a single report job to BullMQ with deterministic ID.
   * Returns true if job was submitted, false if it already existed.
   */
  private async dispatchJob(
    project: ActiveProjectRow,
    reportType: ScheduledReportType,
    format: ScheduledReportFormat,
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

  /**
   * Get ISO week identifier: "{year}-W{week}"
   * e.g., "2026-W09" for the 9th week of 2026.
   */
  private getISOWeekIdentifier(): string {
    const now = new Date();
    const year = now.getFullYear();

    // ISO week calculation
    const jan1 = new Date(year, 0, 1);
    const dayOfYear =
      Math.floor((now.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);

    return `${year}-W${String(weekNum).padStart(2, '0')}`;
  }
}

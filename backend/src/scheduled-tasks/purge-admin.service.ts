/**
 * Purge Admin Service — BullMQ Producer for Manual Purge Triggers
 *
 * ARCHITECTURE:
 * This service is the HTTP-facing counterpart to ProjectPurgeProcessor.
 * It validates inputs and enqueues purge jobs for async execution.
 *
 * PATTERN (same as ProjectGenerationService):
 *   Controller → Service (validate + enqueue) → BullMQ Queue → Processor
 *   Controller → Service (query job status) → BullMQ Queue → response
 *
 * WHY A SERVICE (not direct queue access in controller):
 * 1. Project existence + soft-delete validation before enqueue
 * 2. Job status mapping from BullMQ internals to our API contract
 * 3. Testability — mock the service, not the queue
 *
 * QUEUE UNAVAILABILITY:
 * If Redis is down, `queue.add()` throws. We catch this and throw
 * ServiceUnavailableException (503) instead of 500.
 *
 * @see ProjectGenerationService for the established async job pattern
 * @see ProjectPurgeProcessor for the consumer side
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  PROJECT_PURGE_QUEUE,
  PURGE_JOB_NAME,
  PURGE_MAX_ATTEMPTS,
  PURGE_BACKOFF_DELAY_MS,
  PurgeJobPayload,
  PurgeResult,
} from './purge.constants';
import {
  ManualPurgeResponse,
  PurgeStatusResponse,
  PurgeJobState,
} from './purge.dto';

// =============================================================================
// PROJECT VALIDATION QUERY RESULT
// =============================================================================

/**
 * Shape returned by the project existence check query.
 * Only fetches the minimum columns needed for validation.
 */
interface ProjectValidationRow {
  readonly id: string;
  readonly name: string;
  readonly deletedAt: Date | null;
}

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class PurgeAdminService {
  private readonly logger = new Logger(PurgeAdminService.name);

  constructor(
    @InjectQueue(PROJECT_PURGE_QUEUE)
    private readonly purgeQueue: Queue<PurgeJobPayload, PurgeResult[]>,
    private readonly dataSource: DataSource,
  ) {}

  // ===========================================================================
  // ENQUEUE MANUAL PURGE
  // ===========================================================================

  /**
   * Validate and enqueue a manual purge job for a specific project.
   *
   * VALIDATION ORDER (fail fast):
   * 1. Project exists? → 404
   * 2. Project is soft-deleted? → 400 (cannot purge active projects)
   * 3. Enqueue to BullMQ → 503 if Redis is down
   *
   * The actual purge runs asynchronously in ProjectPurgeProcessor.
   * The returned jobId is used for status polling via getJobStatus().
   *
   * @param projectId - UUID of the project to purge
   * @param actorId - UUID of the admin triggering the purge (from JWT)
   * @returns Enqueue confirmation with jobId for status polling
   *
   * @throws NotFoundException if project doesn't exist
   * @throws BadRequestException if project is not soft-deleted
   * @throws ServiceUnavailableException if Redis/BullMQ is down
   */
  async enqueueManualPurge(
    projectId: string,
    actorId: string,
  ): Promise<ManualPurgeResponse> {
    // Step 1: Validate project exists and is soft-deleted
    const project = await this.validateProjectForPurge(projectId);

    // Step 2: Enqueue BullMQ job
    try {
      const payload: PurgeJobPayload = {
        targetProjectId: projectId,
        actorId,
      };

      const job = await this.purgeQueue.add(PURGE_JOB_NAME, payload, {
        removeOnComplete: 100, // Keep last 100 completed jobs for status queries
        removeOnFail: 50,
        attempts: PURGE_MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: PURGE_BACKOFF_DELAY_MS,
        },
      });

      const jobId = job.id ?? 'unknown';

      this.logger.log(
        `Manual purge enqueued for project "${project.name}" (${projectId}) by ${actorId} — Job ID: ${jobId}`,
      );

      return {
        jobId,
        status: 'queued',
        message: `Purge job queued for project "${project.name}". Poll GET /scheduled-tasks/purge/status/${jobId} for progress.`,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown queue error';
      this.logger.error(
        `Failed to enqueue manual purge for project ${projectId}: ${message}`,
      );

      throw new ServiceUnavailableException(
        'Purge service is temporarily unavailable. Please try again later.',
      );
    }
  }

  // ===========================================================================
  // JOB STATUS QUERY
  // ===========================================================================

  /**
   * Retrieve the current status of a purge job.
   *
   * Maps BullMQ internal job state to our typed API response.
   * Includes full PurgeResult[] when completed, error message when failed.
   *
   * @param jobId - BullMQ job ID returned from enqueueManualPurge()
   * @returns Current job state with results or error details
   *
   * @throws NotFoundException if the job doesn't exist or has expired
   */
  async getJobStatus(jobId: string): Promise<PurgeStatusResponse> {
    const job = await this.purgeQueue.getJob(jobId);

    if (!job) {
      throw new NotFoundException(
        `Purge job "${jobId}" not found. It may have expired or never existed.`,
      );
    }

    const state = await job.getState();

    // Map BullMQ state to our typed union
    const mappedState: PurgeJobState = this.isKnownState(state)
      ? state
      : 'unknown';

    const response: PurgeStatusResponse = {
      jobId,
      status: mappedState,
    };

    // Attach results only when completed
    if (state === 'completed' && job.returnvalue) {
      return {
        ...response,
        results: job.returnvalue as ReadonlyArray<PurgeResult>,
      };
    }

    // Attach error only when failed
    if (state === 'failed') {
      return {
        ...response,
        error: job.failedReason ?? 'Unknown failure reason',
      };
    }

    return response;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Validate that a project exists and is soft-deleted.
   *
   * Uses raw SQL query (not TenantRepository) because:
   * - This is a SuperAdmin operation scoped to the entire system
   * - Soft-deleted projects are excluded by TypeORM's global @DeleteDateColumn filter
   * - We need to explicitly include soft-deleted rows (WHERE "deletedAt" IS NOT NULL)
   *
   * @throws NotFoundException if project doesn't exist
   * @throws BadRequestException if project is not soft-deleted
   */
  private async validateProjectForPurge(
    projectId: string,
  ): Promise<ProjectValidationRow> {
    const rows: ProjectValidationRow[] = await this.dataSource.query(
      `SELECT id, name, "deletedAt" FROM projects WHERE id = $1`,
      [projectId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Project "${projectId}" not found.`);
    }

    const project = rows[0];

    if (!project.deletedAt) {
      throw new BadRequestException(
        `Project "${project.name}" is not soft-deleted. Only soft-deleted projects can be permanently purged. Soft-delete the project first, then retry.`,
      );
    }

    return project;
  }

  /**
   * Type guard for BullMQ job states we expose in our API.
   */
  private isKnownState(state: string): state is PurgeJobState {
    return ['waiting', 'active', 'completed', 'failed', 'delayed'].includes(
      state,
    );
  }
}

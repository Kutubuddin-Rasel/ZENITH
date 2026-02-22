/**
 * Project Generation Service (BullMQ Producer)
 *
 * Enqueues text-to-project generation jobs and provides status polling.
 * The actual LLM call + DB transaction happens in ProjectGenerationProcessor.
 *
 * ARCHITECTURE (per arch-single-responsibility):
 *   Service = Producer (enqueue jobs, query status)
 *   Processor = Consumer (LLM + DB transaction)
 *
 * DEEP THINKING — QUEUE UNAVAILABILITY:
 * ─────────────────────────────────────
 * If Redis is down, `this.projectQueue.add()` throws.
 * We catch this explicitly and throw ServiceUnavailableException (503)
 * instead of letting it crash as 500 Internal Server Error.
 * This gives the frontend a clean signal to show "try again later".
 *
 * DEEP THINKING — IDEMPOTENCY:
 * ───────────────────────────
 * We rely on the @Throttle (3 req/min) rate limiter on the controller
 * rather than implementing a hash-based deduplication check, because:
 *   1. Rate limiter prevents rapid double-clicks (< 1s apart)
 *   2. Hash dedup would require Redis lookup *before* the enqueue,
 *      adding latency and complexity for minimal gain at this phase
 *   3. Generating a duplicate project is harmless — user can delete it
 *   4. The 202 response returns a jobId, so the frontend can track it
 * A proper idempotency key (e.g., Idempotency-Key header + Redis SET NX)
 * can be added in Phase 2 if abuse patterns emerge.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobState } from 'bullmq';

import { GenerateProjectFromTextDto } from '../dto/generate-project-from-text.dto';
import { PROJECT_GENERATION_QUEUE } from '../projects.module';

/**
 * Response from the POST endpoint (job enqueued).
 */
export interface GenerateProjectResponse {
  jobId: string;
  status: 'queued';
  message: string;
}

/**
 * Response from the GET status endpoint.
 * `result` is only present when status === 'completed'.
 * `error` is only present when status === 'failed'.
 */
export interface GenerateJobStatusResponse {
  jobId: string;
  status: JobState | 'unknown';
  result?: {
    projectId: string;
    projectName: string;
    projectKey: string;
    epicCount: number;
    issueCount: number;
  };
  error?: string;
}

@Injectable()
export class ProjectGenerationService {
  private readonly logger = new Logger(ProjectGenerationService.name);

  constructor(
    @InjectQueue(PROJECT_GENERATION_QUEUE)
    private readonly projectQueue: Queue,
  ) {}

  /**
   * Enqueue a project generation job.
   *
   * @param dto - Validated input DTO (rawText + optional methodologyHint)
   * @param userId - Authenticated user ID (from JWT)
   * @param organizationId - Tenant org ID (from JWT)
   * @returns Job ID and queued status
   *
   * @throws ServiceUnavailableException if Redis/BullMQ is down
   */
  async generateProject(
    dto: GenerateProjectFromTextDto,
    userId: string,
    organizationId: string,
  ): Promise<GenerateProjectResponse> {
    try {
      const job = await this.projectQueue.add(
        'generate-from-text',
        {
          rawText: dto.rawText,
          methodologyHint: dto.methodologyHint,
          userId,
          organizationId,
        },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      this.logger.log(
        `Enqueued project generation job ${job.id} for user ${userId}`,
      );

      return {
        jobId: job.id as string,
        status: 'queued',
        message:
          'Project generation started. You will be notified via WebSocket when complete.',
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown queue error';
      this.logger.error(`Failed to enqueue project generation job: ${message}`);

      throw new ServiceUnavailableException(
        'AI project generation is temporarily unavailable. Please try again later.',
      );
    }
  }

  /**
   * Retrieve the status of a previously enqueued generation job.
   *
   * @param jobId - BullMQ job ID returned from generateProject()
   * @returns Current job state with result or error details
   *
   * @throws NotFoundException if the job ID doesn't exist
   */
  async getJobStatus(jobId: string): Promise<GenerateJobStatusResponse> {
    const job = await this.projectQueue.getJob(jobId);

    if (!job) {
      throw new NotFoundException(
        `Generation job "${jobId}" not found. It may have expired or never existed.`,
      );
    }

    const state = await job.getState();

    const response: GenerateJobStatusResponse = {
      jobId: jobId,
      status: state,
    };

    if (state === 'completed' && job.returnvalue) {
      response.result = job.returnvalue as GenerateJobStatusResponse['result'];
    }

    if (state === 'failed') {
      response.error = job.failedReason ?? 'Unknown failure reason';
    }

    return response;
  }
}

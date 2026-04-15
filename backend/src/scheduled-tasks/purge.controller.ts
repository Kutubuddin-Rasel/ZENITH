/**
 * Purge Controller — Admin API for Manual Project Purge
 *
 * ARCHITECTURE:
 * HTTP entry point for on-demand project purge operations.
 * Protected by JwtAuthGuard + SuperAdminGuard — only SuperAdmins can purge.
 *
 * ASYNC PATTERN:
 * POST enqueues a BullMQ job and returns 202 (Accepted) with a jobId.
 * GET polls the job status until completion. This prevents HTTP timeouts
 * on large projects (purge can take 2+ minutes for 100K+ row projects).
 *
 * ENDPOINTS:
 * POST /scheduled-tasks/purge/:projectId → 202 { jobId, status: 'queued' }
 * GET  /scheduled-tasks/purge/status/:jobId → 200 { jobId, status, results? }
 *
 * AUTH:
 * Both endpoints require:
 * 1. Valid JWT token (JwtAuthGuard)
 * 2. User.isSuperAdmin === true (SuperAdminGuard)
 *
 * CODEBASE PRECEDENT:
 * Follows the exact same async job pattern as ProjectGenerationController:
 *   POST → 202 with jobId → GET /status/:jobId for polling
 *
 * @see PurgeAdminService for business logic
 * @see ProjectPurgeProcessor for the job consumer
 * @see ProjectGenerationController for the established pattern
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// TODO: Extract SuperAdminGuard to common/guards/ for cross-module reuse.
// Currently defined in users.controller.ts — stable location, but not ideal.
import { SuperAdminGuard } from '../users/users.controller';
import { AuthenticatedRequest } from '../common/types/authenticated-request.interface';
import { PurgeAdminService } from './purge-admin.service';
import {
  PurgeProjectParamDto,
  PurgeJobStatusParamDto,
  ManualPurgeResponse,
  PurgeStatusResponse,
} from './purge.dto';

// =============================================================================
// CONTROLLER
// =============================================================================

@Controller('scheduled-tasks/purge')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PurgeController {
  constructor(private readonly purgeAdminService: PurgeAdminService) {}

  // ===========================================================================
  // POST /scheduled-tasks/purge/:projectId — Trigger manual purge
  // ===========================================================================

  /**
   * Enqueue a manual purge job for a specific soft-deleted project.
   *
   * The purge runs asynchronously via BullMQ. Use the returned jobId
   * to poll `GET /scheduled-tasks/purge/status/:jobId` for progress.
   *
   * AUTHORIZATION: SuperAdmin only
   * RESPONSE: 202 Accepted (async operation)
   *
   * @param params.projectId - UUID v4 of the project to purge
   * @param req - Authenticated request (JWT payload with userId)
   * @returns Job enqueue confirmation with jobId for status polling
   *
   * @throws 400 if projectId is not a valid UUID
   * @throws 400 if project is not soft-deleted
   * @throws 403 if user is not SuperAdmin
   * @throws 404 if project not found
   * @throws 503 if Redis/BullMQ is unavailable
   */
  @Post(':projectId')
  @HttpCode(HttpStatus.ACCEPTED) // 202 — async operation
  async triggerManualPurge(
    @Param() params: PurgeProjectParamDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ManualPurgeResponse> {
    return this.purgeAdminService.enqueueManualPurge(
      params.projectId,
      req.user.userId,
    );
  }

  // ===========================================================================
  // GET /scheduled-tasks/purge/status/:jobId — Poll job status
  // ===========================================================================

  /**
   * Check the current status of a previously enqueued purge job.
   *
   * STATUS LIFECYCLE:
   *   waiting → active → completed (with PurgeResult[])
   *   waiting → active → failed (with error message)
   *   waiting → delayed (retry backoff) → active → ...
   *
   * AUTHORIZATION: SuperAdmin only (prevents job ID enumeration)
   *
   * @param params.jobId - BullMQ job ID returned from triggerManualPurge()
   * @returns Current job state with results (if completed) or error (if failed)
   *
   * @throws 403 if user is not SuperAdmin
   * @throws 404 if jobId not found or expired
   */
  @Get('status/:jobId')
  async getJobStatus(
    @Param() params: PurgeJobStatusParamDto,
  ): Promise<PurgeStatusResponse> {
    return this.purgeAdminService.getJobStatus(params.jobId);
  }
}

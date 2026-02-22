/**
 * Project Generation Controller
 *
 * HTTP entry points for the "Generate Project from Text" (Magic Wand) feature.
 * Acts as a thin layer that validates input, extracts auth context, and
 * delegates to ProjectGenerationService for queue operations.
 *
 * ARCHITECTURE (per arch-single-responsibility):
 *   Controller = validate + extract auth + delegate
 *   Service = enqueue + status polling
 *   Processor = LLM + DB transaction (background)
 *
 * SECURITY:
 *   - JwtAuthGuard: JWT authentication
 *   - PermissionsGuard: RBAC permission checks
 *   - StatefulCsrfGuard: CSRF protection (POST mutations)
 *   - @Throttle: Rate limiting (3 req/min for expensive AI endpoint)
 *   - @RequireCsrf: CSRF token validation on POST
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { StatefulCsrfGuard, RequireCsrf } from '../../security/csrf/csrf.guard';
import { JwtRequestUser } from '../../auth/types/jwt-request-user.interface';
import { GenerateProjectFromTextDto } from '../dto/generate-project-from-text.dto';
import {
  ProjectGenerationService,
  GenerateProjectResponse,
  GenerateJobStatusResponse,
} from '../services/project-generation.service';

@Controller('projects/ai-generation')
@UseGuards(JwtAuthGuard, PermissionsGuard, StatefulCsrfGuard)
export class ProjectGenerationController {
  constructor(private readonly generationService: ProjectGenerationService) {}

  /**
   * Enqueue a project generation job from unstructured text.
   *
   * SECURITY:
   *   @Throttle(3/60s) — prevents abuse of this expensive AI endpoint.
   *   This is sufficient for Phase 1 idempotency protection:
   *     - Rapid double-clicks are blocked by the rate limiter
   *     - Each call is idempotent in the sense that generating a duplicate
   *       project is harmless (user can delete it)
   *
   * Returns 202 Accepted because the actual generation happens asynchronously
   * in the BullMQ processor. The client should either:
   *   1. Listen for WebSocket event 'project:generated', OR
   *   2. Poll GET /projects/ai-generation/:jobId
   */
  @Post()
  @RequireCsrf()
  @HttpCode(HttpStatus.ACCEPTED) // 202 — async operation in progress
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 generations/min/user
  async generate(
    @Body() dto: GenerateProjectFromTextDto,
    @Request() req: { user: JwtRequestUser },
  ): Promise<GenerateProjectResponse> {
    const { userId, organizationId } = req.user;

    if (!organizationId) {
      throw new ForbiddenException(
        'User must belong to an organization to generate projects',
      );
    }

    return this.generationService.generateProject(dto, userId, organizationId);
  }

  /**
   * Poll the status of a previously enqueued generation job.
   *
   * This is a fallback/supplement to the WebSocket 'project:generated' event.
   * The frontend can poll this endpoint if the WebSocket connection is
   * interrupted during generation.
   *
   * Returns the current job state and any result data or error details.
   */
  @Get(':jobId')
  async getStatus(
    @Param('jobId') jobId: string,
  ): Promise<GenerateJobStatusResponse> {
    return this.generationService.getJobStatus(jobId);
  }
}

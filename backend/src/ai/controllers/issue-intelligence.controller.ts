/**
 * Issue Intelligence Controller
 *
 * AI-powered endpoints for issue management:
 *   - POST /ai/issues/detect-duplicates — Synchronous duplicate detection
 *   - POST /ai/issues/contextual-search — SSE streaming search
 *   - POST /ai/issues/feedback — Rate RAG response quality (👍/👎)
 *
 * SECURITY:
 *   - JwtAuthGuard: JWT authentication
 *   - @Throttle: Rate limiting for expensive AI endpoints
 *   - Tenant ID extracted from JWT, never from user input
 *
 * ARCHITECTURE (per arch-single-responsibility):
 *   Controller = validate + extract auth + delegate
 *   Service = embedding + hybrid search + classification / streaming
 */

import {
  Controller,
  Post,
  Body,
  Sse,
  Res,
  UseGuards,
  Request,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  MessageEvent,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtRequestUser } from '../../auth/types/jwt-request-user.interface';
import {
  DetectDuplicatesDto,
  DuplicateDetectionResponse,
} from '../dto/detect-duplicates.dto';
import { ContextualSearchDto } from '../dto/contextual-search.dto';
import {
  SubmitAIFeedbackDto,
  AIFeedbackResponse,
} from '../dto/submit-ai-feedback.dto';
import { DuplicateDetectionService } from '../services/duplicate-detection.service';
import { ContextualSearchService } from '../services/contextual-search.service';
import { AITelemetryService } from '../services/ai-telemetry.service';

@Controller('ai/issues')
@UseGuards(JwtAuthGuard)
export class IssueIntelligenceController {
  constructor(
    private readonly duplicateDetection: DuplicateDetectionService,
    private readonly contextualSearchService: ContextualSearchService,
    private readonly telemetryService: AITelemetryService,
  ) {}

  /**
   * Detect potential duplicate issues before creation.
   *
   * Called by the frontend as the user types a new issue title/description.
   * Returns semantically similar existing issues with confidence scores.
   *
   * SECURITY:
   *   @Throttle(10/60s) — prevents abuse of the OpenAI embedding API.
   *   10 calls/min allows natural typing with 300ms frontend debounce
   *   while blocking scripted abuse.
   *
   *   Tenant ID (organizationId) is extracted from JWT, NOT from user input.
   *   The SQL query enforces tenant isolation via INNER JOIN + WHERE.
   */
  @Post('detect-duplicates')
  @HttpCode(HttpStatus.OK) // 200 — synchronous result
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 detections/min/user
  async detectDuplicates(
    @Body() dto: DetectDuplicatesDto,
    @Request() req: { user: JwtRequestUser },
  ): Promise<DuplicateDetectionResponse> {
    const { organizationId } = req.user;

    if (!organizationId) {
      throw new ForbiddenException(
        'User must belong to an organization to detect duplicates',
      );
    }

    return this.duplicateDetection.detectDuplicates(dto, organizationId);
  }

  /**
   * Contextual search: ask a natural language question about project history.
   *
   * Returns an SSE stream with:
   *   1. `{ type: 'sources', issues: [...] }` — retrieved issue references
   *   2. `{ type: 'chunk', content: '...' }` — LLM text chunks
   *   3. `{ type: 'done' }` — stream complete
   *   4. `{ type: 'no-results', message: '...' }` — no matching issues
   *   5. `{ type: 'error', message: '...' }` — mid-stream error
   *
   * ROUTING: Uses POST (not GET) because the request body contains
   * structured search parameters. Clients should use
   * @microsoft/fetch-event-source to support POST + SSE.
   *
   * SECURITY:
   *   @Throttle(5/60s) — LLM calls are expensive; tighter limit than
   *   duplicate detection (which only calls embeddings).
   *
   * DEEP THINKING — CLIENT DISCONNECT:
   *   When the client closes the connection, NestJS unsubscribes from
   *   the Observable. The teardown function in ContextualSearchService
   *   calls `stream.controller.abort()` to cancel the OpenAI request,
   *   preventing wasted API credits.
   */
  @Post('contextual-search')
  @Sse()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 searches/min/user
  contextualSearch(
    @Body() dto: ContextualSearchDto,
    @Request() req: { user: JwtRequestUser },
  ): Observable<MessageEvent> {
    const { organizationId } = req.user;

    if (!organizationId) {
      throw new ForbiddenException(
        'User must belong to an organization to search issues',
      );
    }

    return this.contextualSearchService.search(dto, organizationId);
  }

  /**
   * Submit feedback on a contextual search response (👍 or 👎).
   *
   * IDEMPOTENCY: UNIQUE(conversationId, messageId) ensures one rating per
   * message. Re-submissions update the existing record (wasUpdated: true).
   *
   * SECURITY:
   *   @Throttle(10/60s) — HTTP-level rate limiting.
   *   tenantId + userId extracted from JWT, never from user input.
   *
   * STATUS CODES:
   *   201 Created — new feedback recorded
   *   200 OK — existing feedback updated (UPSERT)
   */
  @Post('feedback')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 feedback/min/user
  async submitFeedback(
    @Body() dto: SubmitAIFeedbackDto,
    @Request() req: { user: JwtRequestUser },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AIFeedbackResponse> {
    const { organizationId, userId } = req.user;

    if (!organizationId) {
      throw new ForbiddenException(
        'User must belong to an organization to submit feedback',
      );
    }

    const result = await this.telemetryService.recordFeedback(
      dto,
      organizationId,
      userId,
    );

    // 201 for new feedback, 200 for upsert
    res.status(result.wasUpdated ? HttpStatus.OK : HttpStatus.CREATED);

    return result;
  }
}

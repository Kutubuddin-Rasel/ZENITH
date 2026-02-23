/**
 * AI Telemetry Service — Feedback Recording Pipeline
 *
 * Records user feedback (👍/👎) on contextual search responses.
 * Uses PostgreSQL UPSERT for idempotent persistence.
 *
 * ARCHITECTURE (per arch-single-responsibility):
 *   Controller → THIS SERVICE → TypeORM Repository → PostgreSQL
 *
 * IDEMPOTENCY:
 *   UNIQUE(conversationId, messageId) constraint in the entity handles
 *   deduplication at the database level. INSERT ... ON CONFLICT DO UPDATE
 *   ensures clicking 👎 500 times results in exactly 1 row.
 *
 * SECURITY (per security-use-guards):
 *   tenantId and userId are injected from JWT by the controller.
 *   Never trust user input for these fields.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIFeedback } from '../entities/ai-feedback.entity';
import {
  SubmitAIFeedbackDto,
  AIFeedbackResponse,
} from '../dto/submit-ai-feedback.dto';

@Injectable()
export class AITelemetryService {
  private readonly logger = new Logger(AITelemetryService.name);

  constructor(
    @InjectRepository(AIFeedback)
    private readonly feedbackRepo: Repository<AIFeedback>,
  ) {}

  /**
   * Record user feedback on a contextual search response.
   *
   * Uses PostgreSQL UPSERT (INSERT ... ON CONFLICT DO UPDATE):
   *   - First submission: INSERT new row → 201 Created, wasUpdated: false
   *   - Re-submission:    UPDATE existing row → 200 OK, wasUpdated: true
   *
   * The UNIQUE(conversationId, messageId) constraint handles idempotency.
   *
   * @param dto       - Validated feedback payload from frontend
   * @param tenantId  - Organization ID from JWT (never from user input)
   * @param userId    - User ID from JWT
   * @returns Created/updated feedback record with wasUpdated flag
   */
  async recordFeedback(
    dto: SubmitAIFeedbackDto,
    tenantId: string,
    userId: string,
  ): Promise<AIFeedbackResponse> {
    // Check if feedback already exists for this message
    const existing = await this.feedbackRepo.findOne({
      where: {
        conversationId: dto.conversationId,
        messageId: dto.messageId,
      },
      select: ['id'],
    });

    if (existing) {
      // UPSERT: Update existing rating
      await this.feedbackRepo.update(existing.id, {
        isHelpful: dto.isHelpful,
        comments: dto.comments ?? null,
        responseText: dto.responseText,
      });

      this.logger.log(
        `Feedback updated for message ${dto.messageId}: ${dto.isHelpful ? '👍' : '👎'}`,
      );

      return {
        id: existing.id,
        isHelpful: dto.isHelpful,
        wasUpdated: true,
      };
    }

    // INSERT: New feedback record
    const feedback = this.feedbackRepo.create({
      tenantId,
      userId,
      conversationId: dto.conversationId,
      messageId: dto.messageId,
      queryText: dto.queryText,
      responseText: dto.responseText,
      retrievedIssueIds: dto.retrievedIssueIds,
      isHelpful: dto.isHelpful,
      comments: dto.comments ?? null,
    });

    const saved = await this.feedbackRepo.save(feedback);

    this.logger.log(
      `Feedback recorded for message ${dto.messageId}: ${dto.isHelpful ? '👍' : '👎'}`,
    );

    return {
      id: saved.id,
      isHelpful: saved.isHelpful,
      wasUpdated: false,
    };
  }
}

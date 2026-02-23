/**
 * Submit AI Feedback DTO — Validation for feedback submission endpoint.
 *
 * Uses class-validator (per security-validate-all-input rule).
 *
 * The frontend sends the complete payload (queryText, responseText,
 * retrievedIssueIds) — stateless design that works even after Redis
 * conversation TTL expires. tenantId and userId come from JWT.
 */

import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';

export class SubmitAIFeedbackDto {
  /** Conversation session ID from session-init SSE event (Gap 2). */
  @IsUUID('4', { message: 'conversationId must be a valid UUID' })
  conversationId: string;

  /**
   * Frontend-generated UUID for this specific prompt/response pair.
   * Used as part of the idempotency key — one rating per message.
   */
  @IsUUID('4', { message: 'messageId must be a valid UUID' })
  messageId: string;

  /** The question the user asked. */
  @IsString()
  @IsNotEmpty({ message: 'queryText is required' })
  @MaxLength(500, { message: 'queryText must not exceed 500 characters' })
  queryText: string;

  /** The full LLM response text (accumulated from SSE chunks). */
  @IsString()
  @IsNotEmpty({ message: 'responseText is required' })
  @MaxLength(10000, {
    message: 'responseText must not exceed 10000 characters',
  })
  responseText: string;

  /** Issue UUIDs from the { type: 'sources' } SSE event. */
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each retrievedIssueId must be a UUID' })
  @ArrayMaxSize(20, { message: 'retrievedIssueIds must not exceed 20 items' })
  retrievedIssueIds: string[];

  /** true = 👍 helpful, false = 👎 not helpful. */
  @IsBoolean({ message: 'isHelpful must be a boolean' })
  isHelpful: boolean;

  /** Optional explanation — "What went wrong?" */
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'comments must not exceed 1000 characters' })
  comments?: string;
}

/** Response shape for the feedback endpoint. */
export interface AIFeedbackResponse {
  /** UUID of the feedback record. */
  id: string;
  /** The submitted rating. */
  isHelpful: boolean;
  /** true if this was an update to an existing rating (UPSERT). */
  wasUpdated: boolean;
}

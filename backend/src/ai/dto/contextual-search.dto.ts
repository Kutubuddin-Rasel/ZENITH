/**
 * Contextual Search DTO — Input validation for contextual search endpoint.
 *
 * Uses class-validator (per security-validate-all-input rule).
 * @Transform(trim) prevents whitespace-only queries from wasting LLM tokens.
 */

import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ContextualSearchDto {
  /**
   * Natural language question about project history.
   * Examples:
   *   - "Why did we revert the payment gateway in Sprint 4?"
   *   - "What bugs were fixed in the last release?"
   */
  @IsString()
  @IsNotEmpty({ message: 'Search query is required' })
  @MaxLength(500, { message: 'Query must not exceed 500 characters' })
  @Transform(({ value }: { value: string }) => value?.trim())
  query: string;

  /**
   * Optional project scope — limits search to a single project.
   * If omitted, searches across all projects in the tenant.
   */
  @IsOptional()
  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  projectId?: string;

  /**
   * Maximum number of context issues to retrieve.
   * Fewer results = focused answer. More results = broader context.
   * Default: 5, Max: 10.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxResults must be an integer' })
  @Min(1, { message: 'maxResults must be at least 1' })
  @Max(10, { message: 'maxResults must not exceed 10' })
  maxResults?: number;

  /**
   * Multi-turn conversation tracking.
   * Omit on first turn — backend generates UUID and emits session-init SSE event.
   * Send the returned conversationId on all subsequent turns.
   */
  @IsOptional()
  @IsUUID('4', { message: 'conversationId must be a valid UUID' })
  conversationId?: string;
}

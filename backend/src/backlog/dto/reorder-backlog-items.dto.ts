// src/backlog/dto/reorder-backlog-items.dto.ts
import {
  IsArray,
  IsUUID,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

/**
 * Maximum items per reorder request
 * Prevents DoS via massive array processing
 */
export const BACKLOG_REORDER_MAX_ITEMS = 100;

/**
 * DTO for bulk backlog reordering
 *
 * Security Features:
 * - @IsUUID('4', { each: true }): Strict v4 UUID validation per item
 * - @ArrayMaxSize(100): DoS prevention (event loop protection)
 * - @ArrayMinSize(1): Reject empty/wasted requests
 */
export class ReorderBacklogItemsDto {
  /**
   * Array of issue IDs in new order
   * Each ID must be a valid UUID v4
   *
   * @example ["550e8400-e29b-41d4-a716-446655440000", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"]
   */
  @IsArray({ message: 'issueIds must be an array' })
  @ArrayMinSize(1, { message: 'At least one issue ID is required' })
  @ArrayMaxSize(BACKLOG_REORDER_MAX_ITEMS, {
    message: `Cannot reorder more than ${BACKLOG_REORDER_MAX_ITEMS} items per request`,
  })
  @IsUUID('4', {
    each: true,
    message: 'Each issue ID must be a valid UUID v4 format',
  })
  issueIds: string[];
}

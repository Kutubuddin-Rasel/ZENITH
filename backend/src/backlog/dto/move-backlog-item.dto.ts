// src/backlog/dto/move-backlog-item.dto.ts
import { IsUUID, IsInt, Min, Max } from 'class-validator';

/**
 * Maximum backlog position (reasonable upper bound)
 */
export const BACKLOG_MAX_POSITION = 10000;

/**
 * DTO for moving a single backlog item
 *
 * Security Features:
 * - @IsUUID('4'): Strict v4 UUID validation
 * - @Max(10000): Prevents unreasonable position values
 */
export class MoveBacklogItemDto {
  /**
   * Issue ID to move (must be UUID v4)
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @IsUUID('4', { message: 'Issue ID must be a valid UUID v4 format' })
  issueId: string;

  /**
   * New position in backlog (0-indexed)
   * @example 5
   */
  @IsInt({ message: 'Position must be an integer' })
  @Min(0, { message: 'Position cannot be negative' })
  @Max(BACKLOG_MAX_POSITION, {
    message: `Position cannot exceed ${BACKLOG_MAX_POSITION}`,
  })
  newPosition: number;
}

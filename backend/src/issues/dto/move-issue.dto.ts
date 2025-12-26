// src/issues/dto/move-issue.dto.ts
import { IsOptional, IsNumber, IsUUID } from 'class-validator';

/**
 * DTO for unified issue move endpoint.
 * Handles both sprint assignment changes AND status changes in a single request.
 */
export class MoveIssueDto {
  /**
   * Target sprint ID.
   * - Set to a sprint UUID to assign the issue to that sprint
   * - Set to null to move the issue to backlog (removes from sprint)
   * - Omit (undefined) to keep the current sprint assignment unchanged
   */
  @IsOptional()
  @IsUUID()
  targetSprintId?: string | null;

  /**
   * Target workflow status ID.
   * Used for board column moves.
   * Updates both statusId (source of truth) and legacy status string.
   */
  @IsOptional()
  @IsUUID()
  targetStatusId?: string;

  /**
   * Target position within the destination container.
   * Used for ordering within backlogs, sprint lists, or board columns.
   */
  @IsOptional()
  @IsNumber()
  targetPosition?: number;

  /**
   * Expected version of the issue for optimistic locking.
   * If provided and doesn't match the current version, a 409 Conflict is returned.
   */
  @IsOptional()
  @IsNumber()
  expectedVersion?: number;
}

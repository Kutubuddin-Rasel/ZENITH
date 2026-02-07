// src/releases/dto/assign-issue.dto.ts
import { IsUUID, IsOptional, IsArray } from 'class-validator';

/**
 * DTO for assigning issues to a release
 *
 * Supports both single and bulk assignment patterns.
 * All IDs are strictly validated as UUID v4 format.
 */
export class AssignIssueDto {
  /**
   * Single issue ID to assign
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @IsUUID('4', { message: 'Issue ID must be a valid UUID v4 format' })
  issueId: string;

  /**
   * Optional: Multiple issue IDs for bulk assignment
   * @example ["550e8400-e29b-41d4-a716-446655440000", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"]
   */
  @IsOptional()
  @IsArray({ message: 'Issue IDs must be an array' })
  @IsUUID('4', {
    each: true,
    message: 'Each Issue ID must be a valid UUID v4 format',
  })
  issueIds?: string[];
}

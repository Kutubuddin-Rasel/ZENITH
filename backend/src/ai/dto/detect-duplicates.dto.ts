/**
 * Detect Duplicates DTO — Input validation for duplicate detection endpoint.
 *
 * Uses class-validator (per security-validate-all-input rule):
 * - @Transform(trim) prevents whitespace-only payloads
 * - @IsUUID validates projectId format
 * - @MaxLength caps input to prevent embedding API abuse
 */

import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class DetectDuplicatesDto {
  /**
   * Title of the issue being created.
   * Used as the primary text for semantic similarity matching.
   */
  @IsString()
  @IsNotEmpty({ message: 'Issue title is required' })
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  @Transform(({ value }: { value: string }) => value?.trim())
  title: string;

  /**
   * Optional description of the issue.
   * Concatenated with title to improve embedding quality.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000, {
    message: 'Description must not exceed 2000 characters',
  })
  description?: string;

  /**
   * Project to scope the duplicate search within.
   * SECURITY: organizationId is extracted from JWT, NOT from this DTO.
   * The projectId is validated against the user's org in the SQL query
   * via INNER JOIN projects WHERE organizationId = tenantId.
   */
  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  @IsNotEmpty({ message: 'projectId is required' })
  projectId: string;
}

// ============================================================
// RESPONSE INTERFACES — Strict typing, no `any`
// ============================================================

/**
 * Confidence classification for a duplicate match.
 * Based on ada-002 clustering behavior:
 *   >= 0.92 → high (near-identical)
 *   >= 0.85 → moderate (likely duplicate)
 *   >= 0.78 → weak (possibly related)
 *   <  0.78 → noise (not returned)
 */
export type DuplicateConfidence = 'high' | 'moderate' | 'weak';

/**
 * A single duplicate candidate with similarity score and classification.
 */
export interface DuplicateCandidate {
  issueId: string;
  issueKey: string;
  title: string;
  status: string;
  similarity: number;
  confidence: DuplicateConfidence;
}

/**
 * Response from the duplicate detection endpoint.
 */
export interface DuplicateDetectionResponse {
  duplicates: DuplicateCandidate[];
  totalChecked: number;
  thresholdUsed: number;
}

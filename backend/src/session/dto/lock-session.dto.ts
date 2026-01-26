import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { TrimString } from '../../common/decorators/safe-transform.decorators';

/**
 * DTO for locking a session
 *
 * SECURITY:
 * - @IsUUID prevents SQL injection via malformed sessionId
 * - @Length limits reason to prevent storage exhaustion (DoS)
 * - @TrimString trims whitespace to sanitize inputs
 * - Reason is REQUIRED for audit trail compliance
 */
export class LockSessionDto {
  /**
   * Session ID to lock (passed via URL param, but can be in body too)
   *
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @IsOptional()
  @IsUUID('4', { message: 'Invalid session ID format' })
  sessionId?: string;

  /**
   * Reason for session lock (REQUIRED for compliance)
   * Must be between 1-500 characters
   *
   * @example "Multiple failed authentication attempts"
   */
  @IsNotEmpty({ message: 'Lock reason is required' })
  @IsString()
  @Length(1, 500, {
    message: 'Reason must be between 1 and 500 characters',
  })
  @TrimString()
  reason: string;
}

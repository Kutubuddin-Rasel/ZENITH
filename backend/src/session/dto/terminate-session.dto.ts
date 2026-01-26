import { IsOptional, IsString, Length } from 'class-validator';
import { TrimString } from '../../common/decorators/safe-transform.decorators';

/**
 * DTO for terminating a session
 *
 * SECURITY:
 * - @IsUUID prevents SQL injection via malformed IDs
 * - @Length limits reason to prevent storage exhaustion (DoS)
 * - @TrimString trims whitespace to sanitize inputs
 */
export class TerminateSessionDto {
  /**
   * Reason for session termination
   * Optional - provides audit trail context
   *
   * @example "Suspicious activity detected"
   */
  @IsOptional()
  @IsString()
  @Length(1, 500, {
    message: 'Reason must be between 1 and 500 characters',
  })
  @TrimString()
  reason?: string;

  /**
   * Exclude current session from bulk termination
   * Used by terminateAllMySessions endpoint
   */
  @IsOptional()
  exceptCurrent?: boolean;
}

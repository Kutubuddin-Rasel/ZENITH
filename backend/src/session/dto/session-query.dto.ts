import { IsOptional, IsUUID, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { SessionStatus, SessionType } from '../entities/session.entity';
import { ToLowerCase } from '../../common/decorators/safe-transform.decorators';

/**
 * DTO for querying sessions
 *
 * SECURITY:
 * - @IsUUID prevents SQL injection via userId filter
 * - @IsEnum prevents invalid status/type values
 * - @Max(100) on limit prevents pagination abuse (DoS)
 * - @Type transforms query strings to proper types
 */
export class SessionQueryDto {
  /**
   * Filter by user ID
   *
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @IsOptional()
  @IsUUID('4', { message: 'Invalid user ID format' })
  userId?: string;

  /**
   * Filter by session status
   *
   * @example "active"
   */
  @IsOptional()
  @IsEnum(SessionStatus, {
    message: `Status must be one of: ${Object.values(SessionStatus).join(', ')}`,
  })
  @ToLowerCase()
  status?: SessionStatus;

  /**
   * Filter by session type
   *
   * @example "web"
   */
  @IsOptional()
  @IsEnum(SessionType, {
    message: `Type must be one of: ${Object.values(SessionType).join(', ')}`,
  })
  @ToLowerCase()
  type?: SessionType;

  /**
   * Page number for pagination
   * Minimum: 1
   *
   * @example 1
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number;

  /**
   * Items per page
   * Minimum: 1, Maximum: 100 (prevents DoS via large queries)
   *
   * @example 10
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number;
}

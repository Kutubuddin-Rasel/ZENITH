/**
 * DTOs for Login History query endpoints.
 *
 * Validates and transforms query parameters from the HTTP request
 * before they reach the service layer.
 */

import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query parameters for GET /users/me/login-history
 *
 * Example: GET /users/me/login-history?limit=50
 */
export class LoginHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit must be at most 100' })
  limit?: number;
}

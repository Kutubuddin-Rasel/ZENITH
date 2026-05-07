import { IsDateString, IsOptional } from 'class-validator';

/**
 * Optional time-range filter for satisfaction queries.
 *
 * Both fields are ISO 8601 date strings (YYYY-MM-DD or full ISO timestamp).
 * When omitted, the query returns all-time results.
 *
 * Usage: Pass as @Query() parameters on GET endpoints.
 *   GET /api/satisfaction/admin/org/:orgId/overview?startDate=2026-01-01&endDate=2026-03-31
 */
export class TimeRangeDto {
  /** Start date (inclusive). Format: ISO 8601 (YYYY-MM-DD) */
  @IsOptional()
  @IsDateString(
    {},
    { message: 'startDate must be a valid ISO 8601 date string' },
  )
  startDate?: string;

  /** End date (inclusive). Format: ISO 8601 (YYYY-MM-DD) */
  @IsOptional()
  @IsDateString(
    {},
    { message: 'endDate must be a valid ISO 8601 date string' },
  )
  endDate?: string;
}

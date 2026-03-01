/**
 * Query DTO for the historical metrics endpoint.
 *
 * Validates and types all query parameters. Uses class-validator
 * for automatic request pipeline validation.
 */
import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { MetricType } from '../entities/project-metrics.entity';

export class HistoricalMetricsQueryDto {
    /**
     * Which metric type to query.
     * Strictly validated against the MetricType enum.
     */
    @IsEnum(MetricType, {
        message: `metricType must be one of: ${Object.values(MetricType).join(', ')}`,
    })
    metricType: MetricType;

    /**
     * Start of the date range (inclusive).
     * ISO 8601 format (e.g., '2025-01-01').
     */
    @IsDateString(
        {},
        { message: 'startDate must be a valid ISO 8601 date string' },
    )
    startDate: string;

    /**
     * End of the date range (inclusive).
     * ISO 8601 format (e.g., '2025-06-30').
     */
    @IsDateString(
        {},
        { message: 'endDate must be a valid ISO 8601 date string' },
    )
    endDate: string;

    /**
     * Optional sprint ID for sprint-scoped metrics (e.g., RISK_SCORE).
     * Ignored for project-global metrics (CYCLE_TIME, VELOCITY).
     */
    @IsOptional()
    referenceId?: string;
}

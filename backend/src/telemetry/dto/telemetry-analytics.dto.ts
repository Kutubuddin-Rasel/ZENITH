import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TelemetryMetricType } from '../entities/telemetry-daily-metric.entity';

// =============================================================================
// QUERY DTO
// =============================================================================

/**
 * Query parameters for the telemetry analytics endpoint.
 * All date fields use ISO 8601 (YYYY-MM-DD) format.
 */
export class TelemetryAnalyticsQueryDto {
  /** Start date (inclusive). Format: YYYY-MM-DD */
  @IsDateString()
  startDate: string;

  /** End date (inclusive). Format: YYYY-MM-DD */
  @IsDateString()
  endDate: string;

  /** Filter by project (optional — if omitted, returns all projects for the org) */
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  /** Filter by metric type (optional — if omitted, returns all types) */
  @IsOptional()
  @IsEnum(TelemetryMetricType)
  metricType?: TelemetryMetricType;
}

// =============================================================================
// RESPONSE INTERFACES
// =============================================================================

/** A single data point in the analytics response */
export interface TelemetryDataPoint {
  date: string;
  value: number;
}

/** Grouped metrics for a single project */
export interface TelemetryProjectMetrics {
  projectId: string;
  metrics: {
    metricType: TelemetryMetricType;
    dataPoints: TelemetryDataPoint[];
    total: number;
  }[];
}

/** Top-level analytics response shape */
export interface TelemetryAnalyticsResponse {
  organizationId: string;
  startDate: string;
  endDate: string;
  projects: TelemetryProjectMetrics[];
}

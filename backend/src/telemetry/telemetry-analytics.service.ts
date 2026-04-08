import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TelemetryDailyMetric,
  TelemetryMetricType,
} from './entities/telemetry-daily-metric.entity';
import {
  TelemetryAnalyticsQueryDto,
  TelemetryAnalyticsResponse,
  TelemetryProjectMetrics,
  TelemetryDataPoint,
} from './dto/telemetry-analytics.dto';

// =============================================================================
// RAW QUERY RESULT INTERFACE
// =============================================================================

/**
 * Strict interface for the raw SQL query result.
 * TypeORM QueryBuilder returns raw rows as Record<string, unknown>.
 * This interface documents and types the exact shape we SELECT.
 */
interface RawMetricRow {
  projectId: string;
  metricType: TelemetryMetricType;
  metricDate: string;
  value: string; // PostgreSQL decimal comes as string
}

// =============================================================================
// TELEMETRY ANALYTICS SERVICE
// =============================================================================

/**
 * TelemetryAnalyticsService — Historical Telemetry Querying
 *
 * ARCHITECTURE:
 * Queries the telemetry_daily_metrics table using the compound index
 * (organizationId, projectId, metricType, metricDate) for sub-50ms responses.
 *
 * TENANT ISOLATION:
 * organizationId is ALWAYS the first WHERE clause parameter,
 * ensuring tenant-first index scan. No cross-tenant data leakage.
 *
 * ZERO `any` TOLERANCE.
 */
@Injectable()
export class TelemetryAnalyticsService {
  private readonly logger = new Logger(TelemetryAnalyticsService.name);

  constructor(
    @InjectRepository(TelemetryDailyMetric)
    private readonly metricsRepository: Repository<TelemetryDailyMetric>,
  ) {}

  /**
   * Query historical telemetry metrics for a given organization.
   *
   * Uses createQueryBuilder for optimal SELECT — only fetches the columns
   * needed for the response (no description, no metadata).
   */
  async getAnalytics(
    organizationId: string,
    query: TelemetryAnalyticsQueryDto,
  ): Promise<TelemetryAnalyticsResponse> {
    const qb = this.metricsRepository
      .createQueryBuilder('m')
      .select([
        'm.projectId AS "projectId"',
        'm.metricType AS "metricType"',
        'm.metricDate AS "metricDate"',
        'm.value AS "value"',
      ])
      .where('m.organizationId = :orgId', { orgId: organizationId })
      .andWhere('m.metricDate >= :startDate', { startDate: query.startDate })
      .andWhere('m.metricDate <= :endDate', { endDate: query.endDate })
      .orderBy('m.metricDate', 'ASC');

    if (query.projectId) {
      qb.andWhere('m.projectId = :projectId', { projectId: query.projectId });
    }

    if (query.metricType) {
      qb.andWhere('m.metricType = :metricType', {
        metricType: query.metricType,
      });
    }

    const rawRows: RawMetricRow[] = await qb.getRawMany<RawMetricRow>();

    return this.transformToResponse(organizationId, query, rawRows);
  }

  /**
   * Transform raw database rows into the structured API response.
   *
   * Groups rows by projectId → metricType → data points,
   * and calculates totals for each metric series.
   */
  private transformToResponse(
    organizationId: string,
    query: TelemetryAnalyticsQueryDto,
    rows: RawMetricRow[],
  ): TelemetryAnalyticsResponse {
    // Group by projectId → metricType → data points
    const projectMap = new Map<
      string,
      Map<TelemetryMetricType, TelemetryDataPoint[]>
    >();

    for (const row of rows) {
      if (!projectMap.has(row.projectId)) {
        projectMap.set(row.projectId, new Map());
      }
      const metricMap = projectMap.get(row.projectId)!;

      if (!metricMap.has(row.metricType)) {
        metricMap.set(row.metricType, []);
      }
      metricMap.get(row.metricType)!.push({
        date: row.metricDate,
        value: parseFloat(row.value),
      });
    }

    // Convert maps to response arrays
    const projects: TelemetryProjectMetrics[] = [];
    for (const [projectId, metricMap] of projectMap) {
      const metrics: TelemetryProjectMetrics['metrics'] = [];

      for (const [metricType, dataPoints] of metricMap) {
        const total = dataPoints.reduce((sum, dp) => sum + dp.value, 0);
        metrics.push({ metricType, dataPoints, total });
      }

      projects.push({ projectId, metrics });
    }

    return {
      organizationId,
      startDate: query.startDate,
      endDate: query.endDate,
      projects,
    };
  }
}

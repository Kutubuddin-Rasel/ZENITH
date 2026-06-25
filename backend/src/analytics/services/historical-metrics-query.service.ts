import { Inject, Injectable } from '@nestjs/common';
import { PROJECT_METRICS_REPOSITORY_TOKEN } from '../constants/analytics.tokens';
import type {
  IProjectMetricsRepository,
  IHistoricalMetricsQuery,
  HistoricalMetricPoint,
} from '../interfaces/analytics.interfaces';
import type { MetricType } from '../entities/project-metrics.entity';

/**
 * Historical-metrics read surface (`IHistoricalMetricsQuery`) backing the
 * trend-chart endpoint.
 *
 * CQRS (Step 3): rename of the former `HistoricalMetricsService`, now READ
 * ONLY. The write path (`persistMetricSnapshot`) was the rollup-upsert used by
 * the cron jobs; it moved into `AnalyticsAggregationJobService`, which calls
 * `IProjectMetricsRepository.upsertSnapshot` directly. This service simply
 * delegates the tenant-isolated time-series read to the metrics port.
 */
@Injectable()
export class HistoricalMetricsQueryService implements IHistoricalMetricsQuery {
  constructor(
    @Inject(PROJECT_METRICS_REPOSITORY_TOKEN)
    private readonly metricsRepo: IProjectMetricsRepository,
  ) {}

  getHistoricalMetrics(
    projectId: string,
    metricType: MetricType,
    startDate: string,
    endDate: string,
    referenceId?: string,
  ): Promise<HistoricalMetricPoint[]> {
    return this.metricsRepo.findHistorical(
      projectId,
      metricType,
      startDate,
      endDate,
      referenceId,
    );
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { HistoricalMetricsQueryService } from './historical-metrics-query.service';
import { PROJECT_METRICS_REPOSITORY_TOKEN } from '../constants/analytics.tokens';
import { MetricType } from '../entities/project-metrics.entity';

interface MockMetricsRepo {
  findHistorical: jest.Mock;
  upsertSnapshot: jest.Mock;
}

describe('HistoricalMetricsQueryService', () => {
  let service: HistoricalMetricsQueryService;
  let metricsRepo: MockMetricsRepo;

  beforeEach(async () => {
    const mockMetricsRepo: MockMetricsRepo = {
      findHistorical: jest.fn().mockResolvedValue([]),
      upsertSnapshot: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoricalMetricsQueryService,
        {
          provide: PROJECT_METRICS_REPOSITORY_TOKEN,
          useValue: mockMetricsRepo,
        },
      ],
    }).compile();

    service = module.get(HistoricalMetricsQueryService);
    metricsRepo = module.get(PROJECT_METRICS_REPOSITORY_TOKEN);
  });

  it('delegates the tenant-isolated time-series read to the metrics port', async () => {
    await service.getHistoricalMetrics(
      'p1',
      MetricType.CYCLE_TIME,
      '2025-01-01',
      '2025-06-30',
      'sprint-9',
    );

    expect(metricsRepo.findHistorical).toHaveBeenCalledWith(
      'p1',
      MetricType.CYCLE_TIME,
      '2025-01-01',
      '2025-06-30',
      'sprint-9',
    );
  });
});

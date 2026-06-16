import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AnalyticsAggregationJobService } from './analytics-aggregation-job.service';
import { SPRINT_SNAPSHOT_TOKEN } from '../../sprints';
import {
  ANALYTICS_READ_MODEL_TOKEN,
  PROJECT_METRICS_REPOSITORY_TOKEN,
  SPRINT_RISK_QUERY_TOKEN,
} from '../constants/analytics.tokens';
import { MetricType } from '../entities/project-metrics.entity';
import { ANALYTICS_EVENTS } from '../events/analytics-events';
import type { StalledIssue } from '../interfaces/analytics.interfaces';

// ---------------------------------------------------------------------------
// Strict Mock Types (ZERO `any`)
// ---------------------------------------------------------------------------

interface MockReadModel {
  findStalledIssuesSystemWide: jest.Mock;
  findProjectOrganizationId: jest.Mock;
}
interface MockMetricsRepo {
  upsertSnapshot: jest.Mock;
}
interface MockEventEmitter {
  emit: jest.Mock;
}
interface MockSprintSnapshot {
  findAllActiveSystemWide: jest.Mock;
  captureSnapshot: jest.Mock;
}
interface MockSprintRisk {
  calculateSprintRisk: jest.Mock;
}

const stalled = (overrides?: Partial<StalledIssue>): StalledIssue => ({
  id: 'i1',
  title: 'Stale issue',
  assigneeId: 'u1',
  projectId: 'p1',
  projectKey: 'ZEN',
  daysSinceUpdate: 5,
  ...overrides,
});

describe('AnalyticsAggregationJobService', () => {
  let service: AnalyticsAggregationJobService;
  let readModel: MockReadModel;
  let metricsRepo: MockMetricsRepo;
  let eventEmitter: MockEventEmitter;
  let sprintSnapshot: MockSprintSnapshot;
  let sprintRisk: MockSprintRisk;

  beforeEach(async () => {
    const mockReadModel: MockReadModel = {
      findStalledIssuesSystemWide: jest.fn().mockResolvedValue([]),
      findProjectOrganizationId: jest.fn().mockResolvedValue('org-1'),
    };
    const mockMetricsRepo: MockMetricsRepo = {
      upsertSnapshot: jest.fn().mockResolvedValue(undefined),
    };
    const mockEmitter: MockEventEmitter = {
      emit: jest.fn().mockReturnValue(true),
    };
    const mockSprintSnapshot: MockSprintSnapshot = {
      findAllActiveSystemWide: jest.fn().mockResolvedValue([]),
      captureSnapshot: jest.fn().mockResolvedValue(undefined),
    };
    const mockSprintRisk: MockSprintRisk = {
      calculateSprintRisk: jest
        .fn()
        .mockResolvedValue({ score: 90, level: 'High', factors: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsAggregationJobService,
        { provide: ANALYTICS_READ_MODEL_TOKEN, useValue: mockReadModel },
        {
          provide: PROJECT_METRICS_REPOSITORY_TOKEN,
          useValue: mockMetricsRepo,
        },
        { provide: EventEmitter2, useValue: mockEmitter },
        { provide: SPRINT_SNAPSHOT_TOKEN, useValue: mockSprintSnapshot },
        { provide: SPRINT_RISK_QUERY_TOKEN, useValue: mockSprintRisk },
      ],
    }).compile();

    service = module.get(AnalyticsAggregationJobService);
    readModel = module.get(ANALYTICS_READ_MODEL_TOKEN);
    metricsRepo = module.get(PROJECT_METRICS_REPOSITORY_TOKEN);
    eventEmitter = module.get(EventEmitter2);
    sprintSnapshot = module.get(SPRINT_SNAPSHOT_TOKEN);
    sprintRisk = module.get(SPRINT_RISK_QUERY_TOKEN);
  });

  describe('detectStalledIssues', () => {
    it('returns early without emitting when nothing is stalled', async () => {
      readModel.findStalledIssuesSystemWide.mockResolvedValue([]);
      await service.detectStalledIssues();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(metricsRepo.upsertSnapshot).not.toHaveBeenCalled();
    });

    it('emits STALL_ALERT per assignee and persists the stall rate via the metrics PORT (DIP)', async () => {
      readModel.findStalledIssuesSystemWide.mockResolvedValue([
        stalled({ id: 'i1' }),
        stalled({ id: 'i2' }),
      ]);

      await service.detectStalledIssues();

      // L1 decoupling: the cron emits a domain event (no synchronous
      // cross-module write). Both stalled issues share assignee `u1`, so the
      // fan-out is a single grouped alert.
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.STALL_ALERT,
        expect.objectContaining({
          userIds: ['u1'],
          context: { type: 'stall_alert', issueIds: ['i1', 'i2'] },
        }),
      );
      // Persistence flows through IProjectMetricsRepository, NOT a concrete
      // HistoricalMetricsService facade.
      expect(metricsRepo.upsertSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          projectId: 'p1',
          metricType: MetricType.STALL_RATE,
          value: 2,
        }),
      );
    });
  });

  describe('calculateDailyRisks', () => {
    it('scores risk via the ISprintRiskQuery TOKEN and persists through the metrics PORT (DIP)', async () => {
      sprintSnapshot.findAllActiveSystemWide.mockResolvedValue([
        { id: 's1', projectId: 'p1', name: 'Sprint 1' },
      ]);

      await service.calculateDailyRisks();

      // Risk scoring depends on the contract, not the concrete SprintRiskService.
      expect(sprintRisk.calculateSprintRisk).toHaveBeenCalledWith(
        'p1',
        's1',
        'system',
      );
      expect(metricsRepo.upsertSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          metricType: MetricType.RISK_SCORE,
          value: 90,
          referenceId: 's1',
        }),
      );
      expect(sprintSnapshot.captureSnapshot).toHaveBeenCalledWith('s1');
    });
  });
});

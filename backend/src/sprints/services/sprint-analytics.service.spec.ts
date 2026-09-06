import { Test, TestingModule } from '@nestjs/testing';

import { SprintAnalyticsService } from './sprint-analytics.service';
import { SprintQueryService } from './sprint-query.service';
import { Sprint, SprintStatus } from '../entities/sprint.entity';
import { SprintSnapshot } from '../entities/sprint-snapshot.entity';
import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { AbstractSprintSnapshotRepository } from '../repositories/abstract/sprint-snapshot.repository.abstract';
import { ProjectLookupPort } from '../ports/project-lookup.port';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('SprintAnalyticsService', () => {
  let service: SprintAnalyticsService;
  let sprintRepo: Mocked<AbstractSprintRepository>;
  let snapshotRepo: Mocked<AbstractSprintSnapshotRepository>;
  let projectLookup: Mocked<ProjectLookupPort>;
  let query: { findOne: jest.Mock };
  let cacheStore: { get: jest.Mock; set: jest.Mock };

  const sprintView = {
    id: 'sprint-123',
    name: 'Sprint 1',
    status: SprintStatus.ACTIVE,
    startDate: '2026-06-01',
    endDate: '2026-06-15',
  };

  beforeEach(async () => {
    sprintRepo = {
      findById: jest.fn(),
      findDetailById: jest.fn(),
      findAllInProject: jest.fn(),
      findActiveInProject: jest.fn(),
      findRecentCompleted: jest.fn().mockResolvedValue([]),
      findAllActiveSystemWide: jest.fn(),
      findSprintIssue: jest.fn(),
      findSprintIssuesWithIssue: jest.fn(),
      findSprintIssuesOrdered: jest.fn(),
      aggregateSprintStats: jest.fn(),
      createEntity: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createSprintIssue: jest.fn(),
      moveIssuesToSprint: jest.fn(),
      removeSprintIssue: jest.fn(),
      removeSprintIssues: jest.fn(),
    };
    snapshotRepo = {
      findBySprintAndDate: jest.fn(),
      findBySprintOrdered: jest.fn().mockResolvedValue([]),
      findLatestPerSprint: jest.fn().mockResolvedValue([]),
      createEntity: jest.fn(),
      save: jest.fn(),
    };
    projectLookup = { existsForTenant: jest.fn().mockResolvedValue(true) };
    query = { findOne: jest.fn().mockResolvedValue(sprintView) };
    cacheStore = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintAnalyticsService,
        { provide: AbstractSprintRepository, useValue: sprintRepo },
        { provide: AbstractSprintSnapshotRepository, useValue: snapshotRepo },
        { provide: ProjectLookupPort, useValue: projectLookup },
        { provide: SprintQueryService, useValue: query },
        { provide: CACHE_STORE_TOKEN, useValue: cacheStore },
      ],
    }).compile();

    service = module.get(SprintAnalyticsService);
  });

  describe('getVelocity', () => {
    it('returns a neutral, uncached result when there is no history', async () => {
      const result = await service.getVelocity('project-123', 'user-123');
      expect(result).toEqual({ history: [], average: 0, trend: 'stable' });
      expect(cacheStore.set).not.toHaveBeenCalled();
    });

    it('averages completed points across recent sprints and caches', async () => {
      sprintRepo.findRecentCompleted.mockResolvedValueOnce([
        { id: 's1', name: 'S1' } as Sprint,
        { id: 's2', name: 'S2' } as Sprint,
      ]);
      snapshotRepo.findLatestPerSprint.mockResolvedValueOnce([
        { sprintId: 's1', completedPoints: 10, totalPoints: 10 },
        { sprintId: 's2', completedPoints: 20, totalPoints: 20 },
      ] as SprintSnapshot[]);

      const result = await service.getVelocity('project-123', 'user-123');
      expect(result.average).toBe(15);
      expect(result.history).toHaveLength(2);
      expect(cacheStore.set).toHaveBeenCalled();
    });

    it('short-circuits on a cache hit', async () => {
      cacheStore.get.mockResolvedValueOnce({
        history: [],
        average: 99,
        trend: 'stable',
      });
      const result = await service.getVelocity('project-123', 'user-123');
      expect(result.average).toBe(99);
      expect(sprintRepo.findRecentCompleted).not.toHaveBeenCalled();
    });
  });

  describe('getBurndown / getBurnup', () => {
    it('builds a burndown from ordered snapshots', async () => {
      snapshotRepo.findBySprintOrdered.mockResolvedValueOnce([
        {
          date: '2026-06-01',
          totalPoints: 30,
          completedPoints: 0,
          remainingPoints: 30,
          totalIssues: 5,
          completedIssues: 0,
        },
      ] as SprintSnapshot[]);

      const result = await service.getBurndown(
        'project-123',
        'sprint-123',
        'user-123',
      );
      expect(result.initialScope).toBe(30);
      expect(result.sprint.id).toBe('sprint-123');
      expect(cacheStore.set).toHaveBeenCalled();
    });

    it('computes scope creep in burnup', async () => {
      snapshotRepo.findBySprintOrdered.mockResolvedValueOnce([
        {
          date: '2026-06-01',
          totalPoints: 20,
          completedPoints: 0,
          remainingPoints: 20,
        },
        {
          date: '2026-06-05',
          totalPoints: 30,
          completedPoints: 10,
          remainingPoints: 20,
        },
      ] as SprintSnapshot[]);

      const result = await service.getBurnup(
        'project-123',
        'sprint-123',
        'user-123',
      );
      expect(result.initialScope).toBe(20);
      expect(result.currentScope).toBe(30);
      expect(result.scopeCreep).toBe(10);
      expect(result.scopeCreepPercentage).toBe(50);
    });
  });
});

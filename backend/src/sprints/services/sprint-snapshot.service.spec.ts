import { Test, TestingModule } from '@nestjs/testing';

import { SprintSnapshotService } from './sprint-snapshot.service';
import { Sprint, SprintStatus } from '../entities/sprint.entity';
import { SprintSnapshot } from '../entities/sprint-snapshot.entity';
import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { AbstractSprintSnapshotRepository } from '../repositories/abstract/sprint-snapshot.repository.abstract';
import { CACHE_INVALIDATOR_TOKEN } from '../../cache/constants/cache.tokens';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('SprintSnapshotService', () => {
  let service: SprintSnapshotService;
  let sprintRepo: Mocked<AbstractSprintRepository>;
  let snapshotRepo: Mocked<AbstractSprintSnapshotRepository>;
  let cacheInvalidator: { invalidateByTags: jest.Mock };

  const activeSprint = {
    id: 'sprint-123',
    status: SprintStatus.ACTIVE,
  } as Sprint;

  beforeEach(async () => {
    sprintRepo = {
      findById: jest.fn().mockResolvedValue(activeSprint),
      findDetailById: jest.fn(),
      findAllInProject: jest.fn(),
      findActiveInProject: jest.fn(),
      findRecentCompleted: jest.fn(),
      findAllActiveSystemWide: jest.fn().mockResolvedValue([activeSprint]),
      findSprintIssue: jest.fn(),
      findSprintIssuesWithIssue: jest.fn(),
      findSprintIssuesOrdered: jest.fn(),
      aggregateSprintStats: jest.fn().mockResolvedValue({
        totalPoints: '30',
        completedPoints: '12',
        totalIssues: '5',
        completedIssues: '2',
      }),
      createEntity: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createSprintIssue: jest.fn(),
      moveIssuesToSprint: jest.fn(),
      removeSprintIssue: jest.fn(),
      removeSprintIssues: jest.fn(),
    };
    snapshotRepo = {
      findBySprintAndDate: jest.fn().mockResolvedValue(null),
      findBySprintOrdered: jest.fn(),
      findLatestPerSprint: jest.fn(),
      createEntity: jest.fn(
        (d: Partial<SprintSnapshot>) => ({ ...d }) as SprintSnapshot,
      ),
      save: jest.fn((s: SprintSnapshot) => Promise.resolve(s)),
    };
    cacheInvalidator = {
      invalidateByTags: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintSnapshotService,
        { provide: AbstractSprintRepository, useValue: sprintRepo },
        { provide: AbstractSprintSnapshotRepository, useValue: snapshotRepo },
        { provide: CACHE_INVALIDATOR_TOKEN, useValue: cacheInvalidator },
      ],
    }).compile();

    service = module.get(SprintSnapshotService);
  });

  describe('captureSnapshot', () => {
    it('coerces aggregate strings to numbers and persists a fresh snapshot', async () => {
      await service.captureSnapshot('sprint-123');
      expect(snapshotRepo.createEntity).toHaveBeenCalled();
      expect(snapshotRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          totalPoints: 30,
          completedPoints: 12,
          remainingPoints: 18,
          totalIssues: 5,
          completedIssues: 2,
        }),
      );
      expect(cacheInvalidator.invalidateByTags).toHaveBeenCalledWith([
        'sprint:sprint-123',
      ]);
    });

    it('skips non-active sprints', async () => {
      sprintRepo.findById.mockResolvedValueOnce({
        id: 'sprint-123',
        status: SprintStatus.PLANNED,
      } as Sprint);
      await service.captureSnapshot('sprint-123');
      expect(snapshotRepo.save).not.toHaveBeenCalled();
    });

    it('skips when there are no aggregate stats', async () => {
      sprintRepo.aggregateSprintStats.mockResolvedValueOnce(null);
      await service.captureSnapshot('sprint-123');
      expect(snapshotRepo.save).not.toHaveBeenCalled();
    });

    it('updates an existing same-day snapshot instead of creating one', async () => {
      snapshotRepo.findBySprintAndDate.mockResolvedValueOnce({
        id: 'snap-1',
        sprintId: 'sprint-123',
      } as SprintSnapshot);
      await service.captureSnapshot('sprint-123');
      expect(snapshotRepo.createEntity).not.toHaveBeenCalled();
      expect(snapshotRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'snap-1', totalPoints: 30 }),
      );
    });
  });

  it('findAllActiveSystemWide delegates to the repository', async () => {
    const result = await service.findAllActiveSystemWide();
    expect(result).toEqual([activeSprint]);
    expect(sprintRepo.findAllActiveSystemWide).toHaveBeenCalled();
  });
});

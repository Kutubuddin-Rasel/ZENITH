import { Test, TestingModule } from '@nestjs/testing';
import { CycleTimeQueryService } from './cycle-time-query.service';
import { CycleTimeCalculator } from './cycle-time.calculator';
import { RevisionsService } from '../../revisions/revisions.service';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import { ANALYTICS_READ_MODEL_TOKEN } from '../constants/analytics.tokens';
import { Revision } from '../../revisions/entities/revision.entity';

// ---------------------------------------------------------------------------
// Strict Mock Types (ZERO `any`)
// ---------------------------------------------------------------------------

interface MockReadModel {
  findDoneIssuesForCycleTime: jest.Mock;
  findDoneIssuesInPeriod: jest.Mock;
}

interface MockRevisionsService {
  list: jest.Mock;
  listBatch: jest.Mock;
}

interface MockCacheService {
  get: jest.Mock;
  set: jest.Mock;
}

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

const createMockIssue = (
  overrides?: Partial<{
    id: string;
    title: string;
    status: string;
    updatedAt: Date;
  }>,
) => ({
  id: 'issue-1',
  title: 'Test Issue',
  status: 'Done',
  updatedAt: new Date('2023-01-02T12:00:00Z'),
  ...overrides,
});

const createMockRevisions = (entityId: string): Partial<Revision>[] => [
  {
    id: 'rev-3',
    entityId,
    entityType: 'Issue',
    createdAt: new Date('2023-01-02T12:00:00Z'),
    action: 'UPDATE',
    snapshot: { status: 'Done' },
    changedBy: 'user-1',
  },
  {
    id: 'rev-2',
    entityId,
    entityType: 'Issue',
    createdAt: new Date('2023-01-01T12:00:00Z'),
    action: 'UPDATE',
    snapshot: { status: 'To Do' },
    changedBy: 'user-1',
  },
  {
    id: 'rev-1',
    entityId,
    entityType: 'Issue',
    createdAt: new Date('2023-01-01T10:00:00Z'),
    action: 'CREATE',
    snapshot: { status: 'To Do' },
    changedBy: 'user-1',
  },
];

const createFastRevisions = (entityId: string): Partial<Revision>[] => [
  {
    id: 'rev-fast-2',
    entityId,
    entityType: 'Issue',
    createdAt: new Date('2023-01-01T13:00:00Z'),
    action: 'UPDATE',
    snapshot: { status: 'Done' },
    changedBy: 'user-1',
  },
  {
    id: 'rev-fast-1',
    entityId,
    entityType: 'Issue',
    createdAt: new Date('2023-01-01T12:00:00Z'),
    action: 'UPDATE',
    snapshot: { status: 'To Do' },
    changedBy: 'user-1',
  },
];

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CycleTimeQueryService', () => {
  let service: CycleTimeQueryService;
  let readModel: MockReadModel;
  let revisionsService: MockRevisionsService;
  let cacheService: MockCacheService;

  beforeEach(async () => {
    // Step 2: the raw `issues` SQL moved behind `IAnalyticsReadModel`. The
    // service is now exercised purely through the read-model port; tenant
    // isolation (tenantJoin) is covered by the repository's own spec.
    const mockReadModel: MockReadModel = {
      findDoneIssuesForCycleTime: jest.fn().mockResolvedValue([]),
      // Default: previous (trend) period is empty unless a test overrides it.
      findDoneIssuesInPeriod: jest.fn().mockResolvedValue([]),
    };
    const mockRevisionsService: MockRevisionsService = {
      list: jest.fn(),
      listBatch: jest.fn(),
    };
    const mockCacheService: MockCacheService = {
      get: jest.fn().mockResolvedValue(null), // Default: cache miss
      set: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CycleTimeQueryService,
        // Real calculator — exercises the pure math through the orchestration.
        CycleTimeCalculator,
        { provide: ANALYTICS_READ_MODEL_TOKEN, useValue: mockReadModel },
        { provide: RevisionsService, useValue: mockRevisionsService },
        { provide: CACHE_STORE_TOKEN, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<CycleTimeQueryService>(CycleTimeQueryService);
    readModel = module.get(ANALYTICS_READ_MODEL_TOKEN);
    revisionsService = module.get(RevisionsService);
    cacheService = module.get(CACHE_STORE_TOKEN);
  });

  describe('calculateProjectCycleTime', () => {
    it('should return empty metrics if no completed issues', async () => {
      readModel.findDoneIssuesForCycleTime.mockResolvedValue([]);
      const result = await service.calculateProjectCycleTime('p1');
      expect(result.averageDays).toBe(0);
      expect(result.data).toEqual([]);
    });

    it('should calculate cycle time using batch revision fetching', async () => {
      const mockIssue = createMockIssue();
      readModel.findDoneIssuesForCycleTime.mockResolvedValue([mockIssue]);
      revisionsService.listBatch.mockResolvedValue(
        createMockRevisions('issue-1'),
      );

      const result = await service.calculateProjectCycleTime('p1', 'detailed');

      expect(result.totalIssues).toBe(1);
      expect(result.averageDays).toBe(1.0);
      expect(result.data[0].cycleTimeHours).toBe(24);
      expect(revisionsService.listBatch).toHaveBeenCalledWith('Issue', [
        'issue-1',
      ]);
      expect(revisionsService.list).not.toHaveBeenCalled();
    });

    it('should handle issues with missing history (default 1 hour)', async () => {
      const mockIssue = createMockIssue();
      readModel.findDoneIssuesForCycleTime.mockResolvedValue([mockIssue]);
      revisionsService.listBatch.mockResolvedValue([]);

      const result = await service.calculateProjectCycleTime('p1', 'detailed');
      expect(result.data[0].cycleTimeHours).toBe(1);
    });

    it('should calculate trend (up) with previous-period read-model call', async () => {
      const mockIssue = createMockIssue();
      readModel.findDoneIssuesForCycleTime.mockResolvedValue([mockIssue]);
      readModel.findDoneIssuesInPeriod.mockResolvedValue([mockIssue]);
      revisionsService.listBatch
        .mockResolvedValueOnce(createMockRevisions('issue-1'))
        .mockResolvedValueOnce(createFastRevisions('issue-1'));

      const result = await service.calculateProjectCycleTime('p1');
      expect(result.trend).toBe('up');
    });

    it('should batch-fetch revisions for multiple issues', async () => {
      const issue1 = createMockIssue({ id: 'issue-1', title: 'Issue 1' });
      const issue2 = createMockIssue({ id: 'issue-2', title: 'Issue 2' });
      readModel.findDoneIssuesForCycleTime.mockResolvedValue([issue1, issue2]);

      const allRevisions = [
        ...createMockRevisions('issue-1'),
        ...createMockRevisions('issue-2'),
      ];
      revisionsService.listBatch.mockResolvedValue(allRevisions);

      const result = await service.calculateProjectCycleTime('p1', 'detailed');

      expect(result.totalIssues).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(revisionsService.listBatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('caching', () => {
    it('should return cached result on cache hit', async () => {
      const cachedPayload = {
        averageDays: 2.5,
        p50Days: 1.5,
        p85Days: 3.0,
        p95Days: 4.0,
        totalIssues: 10,
        trend: 'down' as const,
        data: [
          {
            issueId: 'cached-1',
            issueTitle: 'Cached Issue',
            cycleTimeHours: 48,
            completedAt: '2023-06-15T10:00:00.000Z',
          },
        ],
      };

      cacheService.get.mockResolvedValue(cachedPayload);

      const result = await service.calculateProjectCycleTime('p1', 'detailed');

      // Should return cached data without hitting the read model
      expect(result.averageDays).toBe(2.5);
      expect(result.totalIssues).toBe(10);
      expect(result.trend).toBe('down');
      expect(result.data[0].issueId).toBe('cached-1');
      expect(readModel.findDoneIssuesForCycleTime).not.toHaveBeenCalled();
      expect(revisionsService.listBatch).not.toHaveBeenCalled();
    });

    it('should cache result after DB calculation', async () => {
      const mockIssue = createMockIssue();
      readModel.findDoneIssuesForCycleTime.mockResolvedValue([mockIssue]);
      revisionsService.listBatch.mockResolvedValue(
        createMockRevisions('issue-1'),
      );

      await service.calculateProjectCycleTime('p1');

      expect(cacheService.set).toHaveBeenCalledWith(
        'cycletime:p1:30',
        expect.objectContaining({
          averageDays: expect.any(Number) as number,
          totalIssues: 1,
          trend: expect.any(String) as string,
        }),
        { ttl: 300, namespace: 'analytics' },
      );
    });

    it('should fail-open when cache read throws', async () => {
      cacheService.get.mockRejectedValue(new Error('Redis connection lost'));

      const mockIssue = createMockIssue();
      readModel.findDoneIssuesForCycleTime.mockResolvedValue([mockIssue]);
      revisionsService.listBatch.mockResolvedValue(
        createMockRevisions('issue-1'),
      );

      // Should NOT throw — gracefully falls through to DB
      const result = await service.calculateProjectCycleTime('p1', 'detailed');
      expect(result.totalIssues).toBe(1);
      expect(result.data[0].cycleTimeHours).toBe(24);
    });

    it('should fail-open when cache write throws', async () => {
      cacheService.set.mockRejectedValue(new Error('Redis write failed'));

      const mockIssue = createMockIssue();
      readModel.findDoneIssuesForCycleTime.mockResolvedValue([mockIssue]);
      revisionsService.listBatch.mockResolvedValue(
        createMockRevisions('issue-1'),
      );

      // Should NOT throw — result still returned despite cache write failure
      const result = await service.calculateProjectCycleTime('p1', 'detailed');
      expect(result.totalIssues).toBe(1);
    });
  });

  describe('read-model delegation', () => {
    it('should delegate the previous-period trend read to the read model', async () => {
      const mockIssue = createMockIssue();
      readModel.findDoneIssuesForCycleTime.mockResolvedValue([mockIssue]);
      revisionsService.listBatch.mockResolvedValue(
        createMockRevisions('issue-1'),
      );

      await service.calculateProjectCycleTime('p1');

      // Trend calculation reads the prior window via the port (tenant
      // isolation is enforced inside the Postgres read repository).
      expect(readModel.findDoneIssuesInPeriod).toHaveBeenCalledTimes(1);
      const [projectId, start, end] = readModel.findDoneIssuesInPeriod.mock
        .calls[0] as [string, Date, Date];
      expect(projectId).toBe('p1');
      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
    });
  });
});

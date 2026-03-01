import { Test, TestingModule } from '@nestjs/testing';
import { CycleTimeService } from './cycle-time.service';
import { DataSource } from 'typeorm';
import { RevisionsService } from '../../revisions/revisions.service';
import { TenantContext } from '../../core/tenant/tenant-context.service';
import { CacheService } from '../../cache/cache.service';
import { Revision } from '../../revisions/entities/revision.entity';

// ---------------------------------------------------------------------------
// Strict Mock Types (ZERO `any`)
// ---------------------------------------------------------------------------

interface MockDataSource {
  query: jest.Mock;
}

interface MockRevisionsService {
  list: jest.Mock;
  listBatch: jest.Mock;
}

interface MockTenantContext {
  getTenantId: jest.Mock;
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

describe('CycleTimeService', () => {
  let service: CycleTimeService;
  let dataSource: MockDataSource;
  let revisionsService: MockRevisionsService;
  let cacheService: MockCacheService;

  beforeEach(async () => {
    const mockDataSource: MockDataSource = { query: jest.fn() };
    const mockRevisionsService: MockRevisionsService = {
      list: jest.fn(),
      listBatch: jest.fn(),
    };
    const mockTenantContext: MockTenantContext = {
      getTenantId: jest.fn().mockReturnValue('org-1'),
    };
    const mockCacheService: MockCacheService = {
      get: jest.fn().mockResolvedValue(null), // Default: cache miss
      set: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CycleTimeService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: RevisionsService, useValue: mockRevisionsService },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<CycleTimeService>(CycleTimeService);
    dataSource = module.get(DataSource);
    revisionsService = module.get(RevisionsService);
    cacheService = module.get(CacheService);
  });

  describe('calculateProjectCycleTime', () => {
    it('should return empty metrics if no completed issues', async () => {
      dataSource.query.mockResolvedValue([]);
      const result = await service.calculateProjectCycleTime('p1');
      expect(result.averageDays).toBe(0);
      expect(result.data).toEqual([]);
    });

    it('should calculate cycle time using batch revision fetching', async () => {
      const mockIssue = createMockIssue();
      dataSource.query
        .mockResolvedValueOnce([mockIssue])
        .mockResolvedValueOnce([]);
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
      dataSource.query
        .mockResolvedValueOnce([mockIssue])
        .mockResolvedValueOnce([]);
      revisionsService.listBatch.mockResolvedValue([]);

      const result = await service.calculateProjectCycleTime('p1', 'detailed');
      expect(result.data[0].cycleTimeHours).toBe(1);
    });

    it('should calculate trend (up) with tenant-isolated previous period', async () => {
      const mockIssue = createMockIssue();
      dataSource.query
        .mockResolvedValueOnce([mockIssue])
        .mockResolvedValueOnce([mockIssue]);
      revisionsService.listBatch
        .mockResolvedValueOnce(createMockRevisions('issue-1'))
        .mockResolvedValueOnce(createFastRevisions('issue-1'));

      const result = await service.calculateProjectCycleTime('p1');
      expect(result.trend).toBe('up');
    });

    it('should batch-fetch revisions for multiple issues', async () => {
      const issue1 = createMockIssue({ id: 'issue-1', title: 'Issue 1' });
      const issue2 = createMockIssue({ id: 'issue-2', title: 'Issue 2' });
      dataSource.query
        .mockResolvedValueOnce([issue1, issue2])
        .mockResolvedValueOnce([]);

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

      // Should return cached data without hitting DB
      expect(result.averageDays).toBe(2.5);
      expect(result.totalIssues).toBe(10);
      expect(result.trend).toBe('down');
      expect(result.data[0].issueId).toBe('cached-1');
      expect(dataSource.query).not.toHaveBeenCalled();
      expect(revisionsService.listBatch).not.toHaveBeenCalled();
    });

    it('should cache result after DB calculation', async () => {
      const mockIssue = createMockIssue();
      dataSource.query
        .mockResolvedValueOnce([mockIssue])
        .mockResolvedValueOnce([]);
      revisionsService.listBatch.mockResolvedValue(
        createMockRevisions('issue-1'),
      );

      await service.calculateProjectCycleTime('p1');

      expect(cacheService.set).toHaveBeenCalledWith(
        'cycletime:p1:30',
        expect.objectContaining({
          averageDays: expect.any(Number),
          totalIssues: 1,
          trend: expect.any(String),
        }),
        { ttl: 300, namespace: 'analytics' },
      );
    });

    it('should fail-open when cache read throws', async () => {
      cacheService.get.mockRejectedValue(new Error('Redis connection lost'));

      const mockIssue = createMockIssue();
      dataSource.query
        .mockResolvedValueOnce([mockIssue])
        .mockResolvedValueOnce([]);
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
      dataSource.query
        .mockResolvedValueOnce([mockIssue])
        .mockResolvedValueOnce([]);
      revisionsService.listBatch.mockResolvedValue(
        createMockRevisions('issue-1'),
      );

      // Should NOT throw — result still returned despite cache write failure
      const result = await service.calculateProjectCycleTime('p1', 'detailed');
      expect(result.totalIssues).toBe(1);
    });
  });

  describe('tenant isolation', () => {
    it('should include tenantJoin in calculateAverageForPeriod query', async () => {
      const mockIssue = createMockIssue();
      dataSource.query.mockResolvedValueOnce([mockIssue]);
      revisionsService.listBatch.mockResolvedValueOnce(
        createMockRevisions('issue-1'),
      );
      dataSource.query.mockResolvedValueOnce([]);

      await service.calculateProjectCycleTime('p1');

      const secondCallSql = dataSource.query.mock.calls[1]?.[0] as string;
      if (secondCallSql) {
        expect(secondCallSql).toContain('INNER JOIN projects');
        expect(secondCallSql).toContain('organizationId');
      }
    });
  });
});

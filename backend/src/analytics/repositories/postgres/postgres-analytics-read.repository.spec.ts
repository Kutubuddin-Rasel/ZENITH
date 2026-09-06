import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PostgresAnalyticsReadRepository } from './postgres-analytics-read.repository';
import { TENANT_CONTEXT_READER_TOKEN } from '../../../core/tenant';

// ---------------------------------------------------------------------------
// Strict Mock Types (ZERO `any`)
// ---------------------------------------------------------------------------

interface MockDataSource {
  query: jest.Mock;
}

interface MockTenantContext {
  getTenantId: jest.Mock;
}

describe('PostgresAnalyticsReadRepository', () => {
  let repo: PostgresAnalyticsReadRepository;
  let dataSource: MockDataSource;
  let tenantContext: MockTenantContext;

  beforeEach(async () => {
    const mockDataSource: MockDataSource = {
      query: jest.fn().mockResolvedValue([]),
    };
    const mockTenantContext: MockTenantContext = {
      getTenantId: jest.fn().mockReturnValue('org-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostgresAnalyticsReadRepository,
        { provide: DataSource, useValue: mockDataSource },
        { provide: TENANT_CONTEXT_READER_TOKEN, useValue: mockTenantContext },
      ],
    }).compile();

    repo = module.get(PostgresAnalyticsReadRepository);
    dataSource = module.get(DataSource);
    tenantContext = module.get(TENANT_CONTEXT_READER_TOKEN);
  });

  describe('request-scoped reads (tenantJoin isolation)', () => {
    it('findDoneIssuesForCycleTime enforces tenantJoin + binds a parameterised lookback', async () => {
      await repo.findDoneIssuesForCycleTime('p1', 30);

      const [sql, params] = dataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('INNER JOIN projects');
      expect(sql).toContain('organizationId');
      // Hardening: lookback is a bound param, NOT string-interpolated
      expect(sql).toContain("INTERVAL '1 day' * $2::int");
      expect(sql).not.toContain('30 days');
      expect(params).toEqual(['p1', 30]);
      expect(tenantContext.getTenantId).toHaveBeenCalled();
    });

    it('findDoneIssuesInPeriod enforces tenantJoin and binds the [start, end] window', async () => {
      const start = new Date('2023-01-01T00:00:00Z');
      const end = new Date('2023-02-01T00:00:00Z');

      await repo.findDoneIssuesInPeriod('p1', start, end);

      const [sql, params] = dataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('INNER JOIN projects');
      expect(sql).toContain('organizationId');
      expect(params).toEqual(['p1', start, end]);
    });

    it('findStalledIssues enforces tenantJoin and binds a parameterised threshold', async () => {
      await repo.findStalledIssues('p1', 3);

      const [sql, params] = dataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('INNER JOIN projects');
      expect(sql).toContain('organizationId');
      expect(sql).toContain("INTERVAL '1 day' * $2::int");
      expect(params).toEqual(['p1', 3]);
    });
  });

  describe('cron-scoped read (no CLS — structural soft-delete filter)', () => {
    it('findStalledIssuesSystemWide filters soft-deleted projects without tenantJoin', async () => {
      await repo.findStalledIssuesSystemWide(3, 100);

      const [sql, params] = dataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('p."deletedAt" IS NULL');
      expect(sql).toContain('i."deletedAt" IS NULL');
      expect(sql).toContain('LIMIT $2::int');
      expect(params).toEqual([3, 100]);
      // Runs outside request context — must NOT touch the CLS tenant id.
      expect(tenantContext.getTenantId).not.toHaveBeenCalled();
    });
  });

  describe('findProjectOrganizationId', () => {
    it('returns the organization id when the project exists', async () => {
      dataSource.query.mockResolvedValueOnce([{ organizationId: 'org-9' }]);
      await expect(repo.findProjectOrganizationId('p1')).resolves.toBe('org-9');
    });

    it('returns null when the project is missing', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await expect(repo.findProjectOrganizationId('p1')).resolves.toBeNull();
    });
  });
});

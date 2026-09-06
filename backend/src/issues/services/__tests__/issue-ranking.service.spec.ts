import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

import { IssueRankingService } from '../issue-ranking.service';
import { IssueRepository } from '../../../database/repositories/issue.repository';
import { Issue } from '../../entities/issue.entity';

/**
 * IssueRankingService — single-writer correctness suite.
 *
 * Asserts the two fixes over the legacy `BacklogService`:
 *  1. `reorderBacklog` issues a PARAMETERISED `unnest` update (no
 *     interpolated IDs) and runs it inside a transaction when no manager
 *     is supplied.
 *  2. `moveBacklogItem` renumbers the whole slice inside ONE transaction.
 * Plus the EntityManager Passthrough: a supplied `manager` is used
 * directly and no new transaction is opened.
 */
describe('IssueRankingService', () => {
  let service: IssueRankingService;

  const mockManager = { query: jest.fn(), save: jest.fn() };
  const mockDataSource = {
    transaction: jest.fn((cb: (m: typeof mockManager) => unknown) =>
      cb(mockManager),
    ),
  };
  const mockIssueRepo = { findByProject: jest.fn() };

  const issue = (id: string, backlogOrder: number): Issue =>
    ({ id, backlogOrder, createdAt: new Date(0) }) as unknown as Issue;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockManager.query.mockResolvedValue([]);
    mockManager.save.mockImplementation((e: unknown) => Promise.resolve(e));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueRankingService,
        { provide: IssueRepository, useValue: mockIssueRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(IssueRankingService);
  });

  describe('reorderBacklog', () => {
    it('runs a parameterised unnest update inside a transaction', async () => {
      await service.reorderBacklog('p1', ['a', 'b', 'c']);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.query).toHaveBeenCalledTimes(1);

      const [sql, params] = mockManager.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      // Static SQL — IDs never interpolated; positions are bind params.
      expect(sql).toMatch(/unnest\(\$1::uuid\[\], \$2::int\[\]\)/);
      expect(sql).not.toContain("'a'");
      expect(params).toEqual([['a', 'b', 'c'], [0, 1, 2], 'p1']);
    });

    it('joins the caller transaction when a manager is passed', async () => {
      const caller = { query: jest.fn().mockResolvedValue([]) };

      await service.reorderBacklog(
        'p1',
        ['a', 'b'],
        caller as unknown as EntityManager,
      );

      expect(caller.query).toHaveBeenCalledTimes(1);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('is a no-op for an empty id list', async () => {
      await service.reorderBacklog('p1', []);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockManager.query).not.toHaveBeenCalled();
    });
  });

  describe('moveBacklogItem', () => {
    it('renumbers the spliced slice inside one transaction', async () => {
      mockIssueRepo.findByProject.mockResolvedValue([
        issue('a', 0),
        issue('b', 1),
        issue('c', 2),
      ]);

      const result = await service.moveBacklogItem('p1', 'c', 0);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b']);
      expect(result.map((i) => i.backlogOrder)).toEqual([0, 1, 2]);
      expect(mockManager.save).toHaveBeenCalledTimes(1);
    });

    it('throws NotFound and never opens a transaction for a missing issue', async () => {
      mockIssueRepo.findByProject.mockResolvedValue([issue('a', 0)]);

      await expect(service.moveBacklogItem('p1', 'zzz', 0)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('persists through the caller manager when passed', async () => {
      mockIssueRepo.findByProject.mockResolvedValue([
        issue('a', 0),
        issue('b', 1),
      ]);
      const caller = {
        save: jest.fn().mockImplementation((e: unknown) => Promise.resolve(e)),
      };

      await service.moveBacklogItem(
        'p1',
        'b',
        0,
        caller as unknown as EntityManager,
      );

      expect(caller.save).toHaveBeenCalledTimes(1);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });
});

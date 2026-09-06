import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, ForbiddenException } from '@nestjs/common';

import { IssueTransitionService } from '../issue-transition.service';
import { IssueQueryService } from '../issue-query.service';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../../membership/constants/membership.tokens';
import { CACHE_STORE_TOKEN } from '../../../cache/constants/cache.tokens';
import { AuditPort } from '../../ports/audit.port';
import { IssueBroadcastPort } from '../../ports/issue-broadcast.port';
import {
  WorkflowStatusLookupPort,
  WorkflowTransitionPolicyPort,
} from '../../ports/workflow-lookup.port';
import { Issue } from '../../entities/issue.entity';

/**
 * IssueTransitionService — Step 3 ACID-correctness regression suite.
 *
 * Asserts the three fixes over the legacy god class:
 *  1. `updateStatus` emits its domain event ONLY AFTER the tx commits.
 *  2. A failed write rolls back and emits NO event (no event-on-rollback).
 *  3. `moveIssue` stamps the REAL tenant_id (not the placeholder).
 */
describe('IssueTransitionService', () => {
  let service: IssueTransitionService;

  const callOrder: string[] = [];

  const mockManager = { save: jest.fn() };
  const mockDataSource = {
    transaction: jest.fn(async (cb: (m: typeof mockManager) => unknown) => {
      const result = await cb(mockManager);
      callOrder.push('commit');
      return result;
    }),
  };

  const mockQuery = { findOne: jest.fn() };
  const mockMembers = { getUserRole: jest.fn() };
  const mockTransitionPolicy = { isTransitionAllowed: jest.fn() };
  const mockStatusLookup = {
    findById: jest.fn(),
    getDefaultStatus: jest.fn(),
    findByProjectAndName: jest.fn(),
  };
  const mockBroadcast = { broadcastToProjectBoards: jest.fn() };
  const mockAudit = { log: jest.fn() };
  const mockCache = { del: jest.fn() };
  const mockEventEmitter = {
    emit: jest.fn(() => {
      callOrder.push('emit');
      return true;
    }),
  };

  const issue = (overrides: Partial<Issue> = {}): Issue =>
    ({
      id: 'issue-1',
      status: 'Todo',
      statusId: 'status-0',
      backlogOrder: 0,
      version: 1,
      project: { organizationId: 'org-42' },
      ...overrides,
    }) as unknown as Issue;

  beforeEach(async () => {
    jest.clearAllMocks();
    callOrder.length = 0;
    mockManager.save.mockImplementation((e: unknown) => Promise.resolve(e));
    mockBroadcast.broadcastToProjectBoards.mockResolvedValue(undefined);
    mockAudit.log.mockResolvedValue(undefined);
    mockCache.del.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueTransitionService,
        { provide: IssueQueryService, useValue: mockQuery },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: mockMembers },
        {
          provide: WorkflowTransitionPolicyPort,
          useValue: mockTransitionPolicy,
        },
        { provide: WorkflowStatusLookupPort, useValue: mockStatusLookup },
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: IssueBroadcastPort, useValue: mockBroadcast },
        { provide: AuditPort, useValue: mockAudit },
        { provide: CACHE_STORE_TOKEN, useValue: mockCache },
      ],
    }).compile();

    service = module.get(IssueTransitionService);
  });

  describe('updateStatus', () => {
    it('emits the domain event only AFTER the transaction commits', async () => {
      mockQuery.findOne.mockResolvedValue(issue());
      mockMembers.getUserRole.mockResolvedValue('PROJECT_LEAD');
      mockTransitionPolicy.isTransitionAllowed.mockResolvedValue({
        allowed: true,
        transitionName: 'Start Progress',
      });

      await service.updateStatus('proj-1', 'issue-1', 'In Progress', 'user-1');

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'issue.updated',
        expect.objectContaining({ action: 'changed status to In Progress ' }),
      );
      // The commit marker must precede the emit marker.
      expect(callOrder).toEqual(['commit', 'emit']);
      expect(mockBroadcast.broadcastToProjectBoards).toHaveBeenCalledWith(
        'proj-1',
        'issue.moved',
        expect.objectContaining({ newColumnId: 'In Progress' }),
      );
    });

    it('does NOT emit when the transactional write fails (rollback)', async () => {
      mockQuery.findOne.mockResolvedValue(issue());
      mockMembers.getUserRole.mockResolvedValue('PROJECT_LEAD');
      mockTransitionPolicy.isTransitionAllowed.mockResolvedValue({
        allowed: true,
      });
      mockManager.save.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.updateStatus('proj-1', 'issue-1', 'Done', 'user-1'),
      ).rejects.toThrow('db down');

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
      expect(mockBroadcast.broadcastToProjectBoards).not.toHaveBeenCalled();
      expect(callOrder).toEqual([]);
    });

    it('rejects a disallowed transition before opening a transaction', async () => {
      mockQuery.findOne.mockResolvedValue(issue());
      mockMembers.getUserRole.mockResolvedValue('MEMBER');
      mockTransitionPolicy.isTransitionAllowed.mockResolvedValue({
        allowed: false,
        reason: 'Members cannot close issues',
      });

      await expect(
        service.updateStatus('proj-1', 'issue-1', 'Done', 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('moveIssue', () => {
    it('stamps the real tenant_id on the audit record (not "unknown")', async () => {
      mockQuery.findOne.mockResolvedValue(issue({ version: 3 }));
      mockStatusLookup.findById.mockResolvedValue({
        id: 'status-9',
        name: 'Done',
        projectId: 'proj-1',
      });

      await service.moveIssue('proj-1', 'issue-1', 'user-1', {
        targetStatusId: 'status-9',
        targetPosition: 2,
        expectedVersion: 3,
      });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'org-42',
          action: 'ISSUE_MOVED',
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'issue.moved',
        expect.objectContaining({ targetStatusId: 'status-9' }),
      );
    });

    it('throws ConflictException on optimistic-lock mismatch (no tx)', async () => {
      mockQuery.findOne.mockResolvedValue(issue({ version: 5 }));

      await expect(
        service.moveIssue('proj-1', 'issue-1', 'user-1', {
          expectedVersion: 2,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockAudit.log).not.toHaveBeenCalled();
    });
  });
});

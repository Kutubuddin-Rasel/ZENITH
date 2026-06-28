/* eslint-disable @typescript-eslint/unbound-method --
 * jest mock-method references are intentional. */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CACHE_INVALIDATOR_TOKEN } from '../../../cache/constants/cache.tokens';
import type { ICacheInvalidator } from '../../../cache/interfaces/cache.interfaces';
import { BoardRepository } from '../../../database/repositories/board.repository';
import { BoardColumnRepository } from '../../../database/repositories/board-column.repository';
import { IssueRepository } from '../../../database/repositories/issue.repository';
import { BoardGateway } from '../../../gateways/board.gateway';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../../membership/enums/project-role.enum';

import { Board } from '../../entities/board.entity';
import { WorkflowLookupPort } from '../../ports/workflow-lookup.port';
import { BoardAuthzService } from '../board-authz.service';
import { BoardOrderingService } from '../board-ordering.service';

/**
 * BoardOrderingService — drag-and-drop realtime ordering tests.
 *
 * Four contracts pinned here:
 *
 *  1. Realtime broadcast goes through `BoardGateway` (NOT
 *     `EventEmitter2` — the two are intentionally segregated; the
 *     gateway carries optimistic-UI snapshots, the audit feed
 *     carries append-only records).
 *
 *  2. `reorderColumns` enforces the two-stage `requireMember` →
 *     `requireLead('reorder columns')` gate; the other two ordering
 *     operations are member-only (sprint participants must be able
 *     to drag cards without being granted lead).
 *
 *  3. `moveIssue` resolves the workflow status name via
 *     `WorkflowLookupPort` — there is NO direct `WorkflowStatus`
 *     entity touch from this service (Step 2 DIP closure).
 *
 *  4. Bulk ordering operations reject inputs > 5000 items and treat
 *     an empty array as a no-op (idempotent skip, no broadcast).
 */
describe('BoardOrderingService', () => {
  let service: BoardOrderingService;

  let boardRepo: jest.Mocked<BoardRepository>;
  let columnRepo: jest.Mocked<BoardColumnRepository>;
  let issueRepo: jest.Mocked<IssueRepository>;
  let workflowLookup: jest.Mocked<WorkflowLookupPort>;
  let members: jest.Mocked<IProjectMemberQuery>;
  let boardGateway: jest.Mocked<BoardGateway>;
  let cacheInvalidator: jest.Mocked<ICacheInvalidator>;

  const board = {
    id: 'b-1',
    projectId: 'p-1',
    project: { organizationId: 'org-1' },
  } as unknown as Board;

  beforeEach(async () => {
    boardRepo = {
      findScopedWithColumnsAndProject: jest.fn().mockResolvedValue(board),
    } as unknown as jest.Mocked<BoardRepository>;

    columnRepo = {
      bulkReorder: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BoardColumnRepository>;

    issueRepo = {
      moveToStatus: jest.fn(),
      bulkReorderInColumn: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IssueRepository>;

    workflowLookup = {
      findStatus: jest.fn(),
    } as unknown as jest.Mocked<WorkflowLookupPort>;

    members = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    } as unknown as jest.Mocked<IProjectMemberQuery>;

    boardGateway = {
      emitColumnsReordered: jest.fn(),
      emitIssueMoved: jest.fn(),
      emitIssueReordered: jest.fn(),
    } as unknown as jest.Mocked<BoardGateway>;

    cacheInvalidator = {
      invalidateByTags: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ICacheInvalidator>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardOrderingService,
        BoardAuthzService,
        { provide: BoardRepository, useValue: boardRepo },
        { provide: BoardColumnRepository, useValue: columnRepo },
        { provide: IssueRepository, useValue: issueRepo },
        { provide: WorkflowLookupPort, useValue: workflowLookup },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: members },
        { provide: BoardGateway, useValue: boardGateway },
        { provide: CACHE_INVALIDATOR_TOKEN, useValue: cacheInvalidator },
      ],
    }).compile();

    service = module.get(BoardOrderingService);
  });

  // ---------------------------------------------------------------------------
  // reorderColumns
  // ---------------------------------------------------------------------------

  describe('reorderColumns', () => {
    it('delegates to BoardColumnRepository.bulkReorder and broadcasts via BoardGateway', async () => {
      await service.reorderColumns('p-1', 'b-1', ['c-2', 'c-1'], 'u-1');

      expect(columnRepo.bulkReorder).toHaveBeenCalledWith('b-1', [
        'c-2',
        'c-1',
      ]);
      expect(boardGateway.emitColumnsReordered).toHaveBeenCalledWith('b-1', {
        projectId: 'p-1',
        boardId: 'b-1',
        orderedColumnIds: ['c-2', 'c-1'],
      });
      expect(cacheInvalidator.invalidateByTags).toHaveBeenCalledWith([
        'board:b-1',
      ]);
    });

    it('treats an empty ordering as a no-op (no SQL, no broadcast)', async () => {
      await service.reorderColumns('p-1', 'b-1', [], 'u-1');

      expect(columnRepo.bulkReorder).not.toHaveBeenCalled();
      expect(boardGateway.emitColumnsReordered).not.toHaveBeenCalled();
    });

    it('rejects pathological inputs of more than 5000 columns', async () => {
      const ids = Array.from({ length: 5001 }, (_, i) => `c-${i}`);
      await expect(
        service.reorderColumns('p-1', 'b-1', ids, 'u-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException("Only ProjectLead can reorder columns") for non-lead', async () => {
      // Two-stage gate calls getUserRole twice — mockResolvedValue (not Once)
      // makes both calls return DEVELOPER: member check passes, lead check fails.
      members.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);
      await expect(
        service.reorderColumns('p-1', 'b-1', ['c-1'], 'u-1'),
      ).rejects.toThrow(
        new ForbiddenException('Only ProjectLead can reorder columns'),
      );
      expect(columnRepo.bulkReorder).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException("Not a project member") before the lead check', async () => {
      members.getUserRole.mockResolvedValueOnce(null);
      await expect(
        service.reorderColumns('p-1', 'b-1', ['c-1'], 'u-1'),
      ).rejects.toThrow(new ForbiddenException('Not a project member'));
    });
  });

  // ---------------------------------------------------------------------------
  // moveIssue
  // ---------------------------------------------------------------------------

  describe('moveIssue', () => {
    beforeEach(() => {
      workflowLookup.findStatus.mockResolvedValue({
        id: 'st-2',
        name: 'In Progress',
      });
      issueRepo.moveToStatus.mockResolvedValue({
        issue: {
          id: 'i-1',
          title: 'Implement auth',
          number: 12,
          status: 'In Progress',
          statusId: 'st-2',
          priority: 'High',
          type: 'Task',
          assigneeId: 'u-9',
          storyPoints: 3,
        } as never,
        prevStatusId: 'st-1',
      });
    });

    it('looks up the workflow status via WorkflowLookupPort (DIP closure)', async () => {
      await service.moveIssue('p-1', 'b-1', 'i-1', 'st-2', 5, 'u-1');
      expect(workflowLookup.findStatus).toHaveBeenCalledWith('p-1', 'st-2');
    });

    it('persists via IssueRepository.moveToStatus and broadcasts via BoardGateway', async () => {
      await service.moveIssue('p-1', 'b-1', 'i-1', 'st-2', 5, 'u-1');

      expect(issueRepo.moveToStatus).toHaveBeenCalledWith(
        'p-1',
        'i-1',
        'st-2',
        'In Progress',
        5,
      );
      expect(boardGateway.emitIssueMoved).toHaveBeenCalledWith(
        'b-1',
        expect.objectContaining({
          issueId: 'i-1',
          fromColumnId: 'st-1',
          toColumnId: 'st-2',
          newIndex: 5,
        }),
      );
    });

    it('throws NotFoundException when the workflow status does not exist', async () => {
      workflowLookup.findStatus.mockResolvedValueOnce(null);
      await expect(
        service.moveIssue('p-1', 'b-1', 'i-1', 'bogus', 0, 'u-1'),
      ).rejects.toThrow(NotFoundException);
      expect(issueRepo.moveToStatus).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the issue does not exist', async () => {
      issueRepo.moveToStatus.mockResolvedValueOnce(null);
      await expect(
        service.moveIssue('p-1', 'b-1', 'missing', 'st-2', 0, 'u-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('member-only gate: rejects non-members but accepts DEVELOPER (no lead required)', async () => {
      members.getUserRole.mockResolvedValueOnce(null);
      await expect(
        service.moveIssue('p-1', 'b-1', 'i-1', 'st-2', 0, 'u-1'),
      ).rejects.toThrow(ForbiddenException);

      // A plain DEVELOPER is allowed — drag-and-drop is not lead-gated.
      members.getUserRole.mockResolvedValueOnce(ProjectRole.DEVELOPER);
      await expect(
        service.moveIssue('p-1', 'b-1', 'i-1', 'st-2', 0, 'u-1'),
      ).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // reorderIssues
  // ---------------------------------------------------------------------------

  describe('reorderIssues', () => {
    it('delegates to IssueRepository.bulkReorderInColumn and broadcasts', async () => {
      await service.reorderIssues(
        'p-1',
        'b-1',
        'col-todo',
        ['i-3', 'i-1', 'i-2'],
        'u-1',
      );

      expect(issueRepo.bulkReorderInColumn).toHaveBeenCalledWith(
        'p-1',
        'col-todo',
        ['i-3', 'i-1', 'i-2'],
      );
      expect(boardGateway.emitIssueReordered).toHaveBeenCalledWith('b-1', {
        projectId: 'p-1',
        boardId: 'b-1',
        columnId: 'col-todo',
        issues: ['i-3', 'i-1', 'i-2'],
      });
    });

    it('treats an empty ordering as a no-op', async () => {
      await service.reorderIssues('p-1', 'b-1', 'col-todo', [], 'u-1');
      expect(issueRepo.bulkReorderInColumn).not.toHaveBeenCalled();
      expect(boardGateway.emitIssueReordered).not.toHaveBeenCalled();
    });

    it('rejects pathological inputs > 5000 issues', async () => {
      const ids = Array.from({ length: 5001 }, (_, i) => `i-${i}`);
      await expect(
        service.reorderIssues('p-1', 'b-1', 'col-todo', ids, 'u-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('member-only gate: rejects non-members', async () => {
      members.getUserRole.mockResolvedValueOnce(null);
      await expect(
        service.reorderIssues('p-1', 'b-1', 'col', ['i-1'], 'u-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

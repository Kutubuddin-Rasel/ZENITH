/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CACHE_STORE_TOKEN } from '../../../cache/constants/cache.tokens';
import type { ICacheStore } from '../../../cache/interfaces/cache.interfaces';
import { BoardRepository } from '../../../database/repositories/board.repository';
import { IssueRepository } from '../../../database/repositories/issue.repository';
import { ProjectRepository } from '../../../database/repositories/project.repository';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../../membership/enums/project-role.enum';

import { Board } from '../../entities/board.entity';
import { BoardType } from '../../enums/board-type.enum';
import { BoardAuthzService } from '../board-authz.service';
import { BoardQueryService } from '../board-query.service';

/**
 * BoardQueryService — read-side unit tests.
 *
 * Pins the three Step-3 read methods (`findAll`, `findOne`,
 * `findOneWithIssues`) against the abstract repository ports + the
 * mapper/grouping logic. Covers:
 *  - the tenant-isolation 404 (organizationId mismatch wins over
 *    membership check),
 *  - the cache-hit short-circuit on `findOneWithIssues`,
 *  - the statusId vs name fallback path in `groupKanbanCardsByColumn`.
 */
describe('BoardQueryService', () => {
  let service: BoardQueryService;
  let boardRepo: jest.Mocked<BoardRepository>;
  let issueRepo: jest.Mocked<IssueRepository>;
  let projectRepo: jest.Mocked<ProjectRepository>;
  let members: jest.Mocked<IProjectMemberQuery>;
  let cacheStore: jest.Mocked<ICacheStore>;

  beforeEach(async () => {
    boardRepo = {
      findByProject: jest.fn(),
      findScopedWithColumnsAndProject: jest.fn(),
    } as unknown as jest.Mocked<BoardRepository>;

    issueRepo = {
      findKanbanCards: jest.fn(),
    } as unknown as jest.Mocked<IssueRepository>;

    projectRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<ProjectRepository>;

    members = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.DEVELOPER),
    } as unknown as jest.Mocked<IProjectMemberQuery>;

    cacheStore = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ICacheStore>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardQueryService,
        BoardAuthzService,
        { provide: BoardRepository, useValue: boardRepo },
        { provide: IssueRepository, useValue: issueRepo },
        { provide: ProjectRepository, useValue: projectRepo },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: members },
        { provide: CACHE_STORE_TOKEN, useValue: cacheStore },
      ],
    }).compile();

    service = module.get(BoardQueryService);
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------
  describe('findAll', () => {
    it('returns project boards for a member', async () => {
      const list: Board[] = [{ id: 'b-1' } as Board];
      boardRepo.findByProject.mockResolvedValue(list);

      const result = await service.findAll('p-1', 'u-1');

      expect(result).toBe(list);
      expect(boardRepo.findByProject).toHaveBeenCalledWith('p-1', {
        relations: ['columns'],
      });
    });

    it('throws NotFoundException when organizationId excludes the project', async () => {
      projectRepo.findOne.mockResolvedValue(null);
      await expect(service.findAll('p-1', 'u-1', 'org-9')).rejects.toThrow(
        NotFoundException,
      );
      expect(boardRepo.findByProject).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller is not a member', async () => {
      members.getUserRole.mockResolvedValue(null);
      await expect(service.findAll('p-1', 'u-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findOne
  // ---------------------------------------------------------------------------
  describe('findOne', () => {
    const board = {
      id: 'b-1',
      projectId: 'p-1',
      columns: [
        { id: 'c2', columnOrder: 2 },
        { id: 'c1', columnOrder: 1 },
      ],
      project: { organizationId: 'org-1' },
    } as unknown as Board;

    it('returns the board with columns sorted by columnOrder ASC', async () => {
      boardRepo.findScopedWithColumnsAndProject.mockResolvedValue(board);

      const result = await service.findOne('p-1', 'b-1', 'u-1');

      expect(result.columns.map((c) => c.id)).toEqual(['c1', 'c2']);
    });

    it('throws NotFoundException when organizationId mismatches before membership check', async () => {
      boardRepo.findScopedWithColumnsAndProject.mockResolvedValue(board);
      await expect(
        service.findOne('p-1', 'b-1', 'u-1', 'org-9'),
      ).rejects.toThrow(NotFoundException);
      // membership check is skipped — the tenant guard fires first
      expect(members.getUserRole).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the board does not exist', async () => {
      boardRepo.findScopedWithColumnsAndProject.mockResolvedValue(null);
      await expect(service.findOne('p-1', 'b-1', 'u-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findOneWithIssues
  // ---------------------------------------------------------------------------
  describe('findOneWithIssues', () => {
    it('short-circuits on cache hit and skips repo + membership', async () => {
      cacheStore.get.mockResolvedValue({
        board: {
          id: 'b-1',
          projectId: 'p-1',
          name: 'cached',
          type: BoardType.KANBAN,
          description: null,
          isActive: true,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
        columns: [],
      });

      const result = await service.findOneWithIssues('p-1', 'b-1', 'u-1');

      expect(result.board.id).toBe('b-1');
      expect(boardRepo.findScopedWithColumnsAndProject).not.toHaveBeenCalled();
      expect(issueRepo.findKanbanCards).not.toHaveBeenCalled();
    });

    it('groups issues by statusId, falls back to column name for legacy rows', async () => {
      boardRepo.findScopedWithColumnsAndProject.mockResolvedValue({
        id: 'b-1',
        projectId: 'p-1',
        name: 'Board',
        type: BoardType.KANBAN,
        description: null,
        isActive: true,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        project: { organizationId: 'org-1' },
        columns: [
          {
            id: 'col-todo',
            boardId: 'b-1',
            name: 'To Do',
            statusId: 'st-todo',
            columnOrder: 0,
          },
          {
            id: 'col-legacy',
            boardId: 'b-1',
            name: 'Legacy',
            statusId: null,
            columnOrder: 1,
          },
        ],
      } as unknown as Board);
      issueRepo.findKanbanCards.mockResolvedValue([
        {
          id: 'i-1',
          title: 'A',
          type: 'task',
          priority: 'High',
          assigneeId: null,
          storyPoints: 1,
          status: 'To Do',
          statusId: 'st-todo',
          backlogOrder: 0,
        },
        {
          id: 'i-2',
          title: 'B',
          type: 'task',
          priority: 'Low',
          assigneeId: null,
          storyPoints: 2,
          status: 'Legacy',
          statusId: null,
          backlogOrder: 1,
        },
      ]);

      const view = await service.findOneWithIssues('p-1', 'b-1', 'u-1');

      expect(view.columns[0].issues.map((i) => i.id)).toEqual(['i-1']);
      expect(view.columns[1].issues.map((i) => i.id)).toEqual(['i-2']);
      expect(cacheStore.set).toHaveBeenCalledWith(
        'board:b-1:slim',
        view,
        expect.objectContaining({ ttl: 5, namespace: 'boards' }),
      );
    });
  });
});

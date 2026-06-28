/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';

import { CACHE_INVALIDATOR_TOKEN } from '../../../cache/constants/cache.tokens';
import type { ICacheInvalidator } from '../../../cache/interfaces/cache.interfaces';
import { BoardRepository } from '../../../database/repositories/board.repository';
import { BoardColumnRepository } from '../../../database/repositories/board-column.repository';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../../membership/enums/project-role.enum';

import { Board } from '../../entities/board.entity';
import { BoardColumn } from '../../entities/board-column.entity';
import { BoardAuthzService } from '../board-authz.service';
import { BoardColumnCommandService } from '../board-column-command.service';

/**
 * BoardColumnCommandService — sub-aggregate write tests.
 *
 * Pins the audit-event payload and the cache-tag invalidation
 * contract (the two side effects every column mutation owes) plus
 * the legacy two-stage authorization ordering (member check fires
 * before lead check).
 */
describe('BoardColumnCommandService', () => {
  let service: BoardColumnCommandService;
  let boardRepo: jest.Mocked<BoardRepository>;
  let columnRepo: jest.Mocked<BoardColumnRepository>;
  let members: jest.Mocked<IProjectMemberQuery>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let cacheInvalidator: jest.Mocked<ICacheInvalidator>;

  const board = {
    id: 'b-1',
    projectId: 'p-1',
    name: 'My Board',
    columns: [],
    project: { organizationId: 'org-1' },
  } as unknown as Board;

  beforeEach(async () => {
    boardRepo = {
      findScopedWithColumnsAndProject: jest.fn().mockResolvedValue(board),
    } as unknown as jest.Mocked<BoardRepository>;

    columnRepo = {
      create: jest.fn(
        (dto: Partial<BoardColumn>): BoardColumn =>
          ({ ...dto, id: 'col-new' }) as BoardColumn,
      ),
      save: jest.fn(
        (col: BoardColumn): Promise<BoardColumn> =>
          Promise.resolve({ ...col, id: col.id ?? 'col-new' }),
      ),
      findOneByBoard: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<BoardColumnRepository>;

    members = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    } as unknown as jest.Mocked<IProjectMemberQuery>;

    eventEmitter = {
      emit: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<EventEmitter2>;

    cacheInvalidator = {
      invalidateByTags: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ICacheInvalidator>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardColumnCommandService,
        BoardAuthzService,
        { provide: BoardRepository, useValue: boardRepo },
        { provide: BoardColumnRepository, useValue: columnRepo },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: members },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: CACHE_INVALIDATOR_TOKEN, useValue: cacheInvalidator },
      ],
    }).compile();

    service = module.get(BoardColumnCommandService);
  });

  describe('addColumn', () => {
    it('persists, emits board.event, and invalidates the board cache tag', async () => {
      const saved = await service.addColumn('p-1', 'b-1', 'u-1', {
        name: 'To Do',
        columnOrder: 0,
      } as never);

      expect(saved.id).toBe('col-new');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'board.event',
        expect.objectContaining({
          projectId: 'p-1',
          actorId: 'u-1',
          boardName: 'My Board',
          columnName: expect.any(String) as string,
        }),
      );
      expect(cacheInvalidator.invalidateByTags).toHaveBeenCalledWith([
        'board:b-1',
      ]);
    });

    it('throws ForbiddenException with the legacy "add columns" verb when caller is not lead', async () => {
      members.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);
      await expect(
        service.addColumn('p-1', 'b-1', 'u-1', { name: 'X' } as never),
      ).rejects.toThrow(
        new ForbiddenException('Only ProjectLead can add columns'),
      );
      expect(columnRepo.save).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException("Not a project member") when caller has no role at all', async () => {
      members.getUserRole.mockResolvedValue(null);
      await expect(
        service.addColumn('p-1', 'b-1', 'u-1', { name: 'X' } as never),
      ).rejects.toThrow(new ForbiddenException('Not a project member'));
    });

    it('throws NotFoundException when organizationId excludes the board', async () => {
      await expect(
        service.addColumn('p-1', 'b-1', 'u-1', { name: 'X' } as never, 'org-9'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateColumn', () => {
    it('updates the row, emits board.event, invalidates cache', async () => {
      const existing = {
        id: 'col-1',
        boardId: 'b-1',
        name: 'Old',
        columnOrder: 0,
      } as BoardColumn;
      columnRepo.findOneByBoard.mockResolvedValue(existing);
      columnRepo.save.mockResolvedValue({ ...existing, name: 'New' });

      const updated = await service.updateColumn('p-1', 'b-1', 'col-1', 'u-1', {
        name: 'New',
      } as never);

      expect(updated.name).toBe('New');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'board.event',
        expect.objectContaining({ columnName: 'New' }),
      );
      expect(cacheInvalidator.invalidateByTags).toHaveBeenCalledWith([
        'board:b-1',
      ]);
    });

    it('throws NotFoundException when the column does not belong to the board', async () => {
      columnRepo.findOneByBoard.mockResolvedValue(null);
      await expect(
        service.updateColumn('p-1', 'b-1', 'col-x', 'u-1', {
          name: 'X',
        } as never),
      ).rejects.toThrow(new NotFoundException('Column not found'));
    });
  });

  describe('removeColumn', () => {
    it('removes the row, emits board.event with the deleted column name', async () => {
      const existing = {
        id: 'col-1',
        boardId: 'b-1',
        name: 'To Be Deleted',
      } as BoardColumn;
      columnRepo.findOneByBoard.mockResolvedValue(existing);

      await service.removeColumn('p-1', 'b-1', 'col-1', 'u-1');

      expect(columnRepo.remove).toHaveBeenCalledWith(existing);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'board.event',
        expect.objectContaining({
          action: 'deleted column To Be Deleted from board',
          columnName: 'To Be Deleted',
        }),
      );
    });

    it('does not fail the user mutation when cache invalidation throws (fire-and-forget)', async () => {
      columnRepo.findOneByBoard.mockResolvedValue({
        id: 'col-1',
        name: 'X',
      } as BoardColumn);
      cacheInvalidator.invalidateByTags.mockRejectedValueOnce(
        new Error('redis down'),
      );

      await expect(
        service.removeColumn('p-1', 'b-1', 'col-1', 'u-1'),
      ).resolves.toBeUndefined();
    });
  });
});

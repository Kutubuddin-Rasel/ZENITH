/* eslint-disable @typescript-eslint/unbound-method --
 * `expect(mock.method).toHaveBeenCalled()` reads a class-method reference,
 * which the rule flags as a `this`-scoping concern. Safe for jest mocks. */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, DeepPartial, EntityManager } from 'typeorm';

import { CACHE_INVALIDATOR_TOKEN } from '../../../cache/constants/cache.tokens';
import type { ICacheInvalidator } from '../../../cache/interfaces/cache.interfaces';
import { BOARD_EVENT_FACTORY_TOKEN } from '../../../common/constants/events.tokens';
import type { IBoardEventFactory } from '../../../common/interfaces/event-factory.interfaces';
import { BoardRepository } from '../../../database/repositories/board.repository';
import { ProjectRepository } from '../../../database/repositories/project.repository';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../../membership/enums/project-role.enum';

import { Board } from '../../entities/board.entity';
import { BoardColumn } from '../../entities/board-column.entity';
import { BoardType } from '../../enums/board-type.enum';
import { BoardAuthzService } from '../board-authz.service';
import { BoardCommandService } from '../board-command.service';

/**
 * BoardCommandService — board lifecycle write tests.
 *
 * Three contracts pinned here:
 *
 *  1. **Transactional `create`** — board insert + column seeding occur
 *     inside a single `DataSource.transaction(cb)` block. The
 *     rollback test mocks the callback so column persistence rejects
 *     mid-transaction; we assert the overall promise rejects AND
 *     `board.event` is NOT emitted AND the cache invalidator is NOT
 *     called. This proves the side-effect ordering: events/cache fire
 *     ONLY after commit, never before, even when the callback throws.
 *
 *  2. **Two-stage authorization for update/remove** — `requireMember`
 *     must run before `requireLead` so consumers see the legacy HTTP
 *     error ordering: a non-member gets "Not a project member"; a
 *     member without the lead role gets "Only ProjectLead can …".
 *     Pre-Step-3 these strings shipped with the action verb baked in
 *     ("create boards" / "update boards" / "delete boards") — the
 *     spec asserts the exact strings to avoid silent string drift.
 *
 *  3. **`BoardSeedPort.seed` adapter** — the seed-only port surface
 *     used by project-templates must round-trip through the same
 *     transactional `create()` body. We assert (a) the boardId is
 *     returned, (b) only `create()` paths fire side effects, and
 *     (c) the BoardSeedSpec's typed `columns` array is forwarded to
 *     the underlying DTO so the legacy `any[]` leak stays closed.
 */
describe('BoardCommandService', () => {
  let service: BoardCommandService;

  let boardRepo: jest.Mocked<BoardRepository>;
  let projectRepo: jest.Mocked<ProjectRepository>;
  let members: jest.Mocked<IProjectMemberQuery>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let cacheInvalidator: jest.Mocked<ICacheInvalidator>;
  let boardEventFactory: jest.Mocked<IBoardEventFactory>;

  let txBoardRepo: { create: jest.Mock; save: jest.Mock };
  let txColumnRepo: { create: jest.Mock; save: jest.Mock };
  let mockDataSource: { transaction: jest.Mock };

  const project = { id: 'p-1', organizationId: 'org-1' };
  const board = {
    id: 'b-1',
    projectId: 'p-1',
    name: 'Main Board',
    project: { organizationId: 'org-1' },
  } as unknown as Board;

  beforeEach(async () => {
    boardRepo = {
      findScopedWithColumnsAndProject: jest.fn().mockResolvedValue(board),
      save: jest.fn((b: Board) => Promise.resolve(b)),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BoardRepository>;

    projectRepo = {
      findOne: jest.fn().mockResolvedValue(project),
    } as unknown as jest.Mocked<ProjectRepository>;

    members = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    } as unknown as jest.Mocked<IProjectMemberQuery>;

    eventEmitter = {
      emit: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<EventEmitter2>;

    cacheInvalidator = {
      invalidateByTags: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ICacheInvalidator>;

    boardEventFactory = {
      create: jest.fn((args: Record<string, unknown>) => ({ ...args })),
    } as unknown as jest.Mocked<IBoardEventFactory>;

    txBoardRepo = {
      create: jest.fn(
        (dto: DeepPartial<Board>): Board =>
          ({ ...dto, id: 'new-board' }) as Board,
      ),
      save: jest.fn(
        (b: DeepPartial<Board>): Promise<Board> =>
          Promise.resolve({ ...b, id: 'new-board' } as Board),
      ),
    };
    txColumnRepo = {
      create: jest.fn(
        (dto: DeepPartial<BoardColumn>): BoardColumn => dto as BoardColumn,
      ),
      save: jest.fn(
        (cols: DeepPartial<BoardColumn>[]): Promise<BoardColumn[]> =>
          Promise.resolve(cols as BoardColumn[]),
      ),
    };

    const txManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Board) return txBoardRepo;
        if (entity === BoardColumn) return txColumnRepo;
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }),
    } as unknown as EntityManager;

    mockDataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(txManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardCommandService,
        BoardAuthzService,
        { provide: BoardRepository, useValue: boardRepo },
        { provide: ProjectRepository, useValue: projectRepo },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: members },
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: CACHE_INVALIDATOR_TOKEN, useValue: cacheInvalidator },
        { provide: BOARD_EVENT_FACTORY_TOKEN, useValue: boardEventFactory },
      ],
    }).compile();

    service = module.get(BoardCommandService);
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    const dto = { name: 'Sprint Board', type: BoardType.KANBAN };

    it('seeds default Kanban columns and emits board.event after commit', async () => {
      const result = await service.create('p-1', 'u-1', dto);

      expect(result).toBeDefined();
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(txColumnRepo.create).toHaveBeenCalledTimes(3);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'board.event',
        expect.objectContaining({ boardName: 'Sprint Board' }),
      );
      expect(cacheInvalidator.invalidateByTags).toHaveBeenCalledWith([
        'board:new-board',
      ]);
    });

    it('seeds 4 default columns for SCRUM', async () => {
      await service.create('p-1', 'u-1', {
        name: 'Sprint',
        type: BoardType.SCRUM,
      });
      expect(txColumnRepo.create).toHaveBeenCalledTimes(4);
    });

    it('uses provided columns when supplied', async () => {
      await service.create('p-1', 'u-1', {
        ...dto,
        columns: [
          { name: 'Custom A', order: 0 },
          { name: 'Custom B', order: 1 },
        ],
      } as never);
      expect(txColumnRepo.create).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when project does not exist', async () => {
      projectRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.create('p-1', 'u-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException("Only ProjectLead can create boards") for non-lead', async () => {
      members.getUserRole.mockResolvedValueOnce(ProjectRole.DEVELOPER);
      await expect(service.create('p-1', 'u-1', dto)).rejects.toThrow(
        new ForbiddenException('Only ProjectLead can create boards'),
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    // Step 2 atomicity guarantee — when column persistence fails inside the
    // transaction callback, the overall promise rejects AND no `board.event`
    // is emitted AND the cache invalidator is NOT called. Pre-Step-2 the
    // event/cache calls ran whether or not column persistence succeeded.
    it('rolls back: rejects, does not emit board.event, does not invalidate cache when column save fails', async () => {
      const failure = new Error(
        'UNIQUE_VIOLATION: board_columns(boardId,name)',
      );
      txColumnRepo.save.mockRejectedValueOnce(failure);

      await expect(service.create('p-1', 'u-1', dto)).rejects.toThrow(failure);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(boardEventFactory.create).not.toHaveBeenCalled();
      expect(cacheInvalidator.invalidateByTags).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  describe('update', () => {
    it('updates the row, emits board.event, invalidates cache', async () => {
      boardRepo.save.mockImplementationOnce((b) =>
        Promise.resolve({ ...(b as Board), name: 'Renamed' }),
      );

      const updated = await service.update('p-1', 'b-1', 'u-1', {
        name: 'Renamed',
      });

      expect(updated.name).toBe('Renamed');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'board.event',
        expect.objectContaining({
          actorId: 'u-1',
          action: expect.stringContaining('updated board') as string,
        }),
      );
      expect(cacheInvalidator.invalidateByTags).toHaveBeenCalledWith([
        'board:b-1',
      ]);
    });

    it('throws ForbiddenException("Only ProjectLead can update boards") for non-lead', async () => {
      // `loadBoardAndAuthorize` calls `getUserRole` TWICE — once for
      // `requireMember` (passes as long as a role exists) then once for
      // `requireLead`. `mockResolvedValue` (not `Once`) drives both calls.
      members.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);
      await expect(
        service.update('p-1', 'b-1', 'u-1', { name: 'X' }),
      ).rejects.toThrow(
        new ForbiddenException('Only ProjectLead can update boards'),
      );
      expect(boardRepo.save).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException("Not a project member") before checking lead role', async () => {
      members.getUserRole.mockResolvedValue(null);
      await expect(
        service.update('p-1', 'b-1', 'u-1', { name: 'X' }),
      ).rejects.toThrow(new ForbiddenException('Not a project member'));
    });

    it('throws NotFoundException when organizationId excludes the board', async () => {
      await expect(
        service.update('p-1', 'b-1', 'u-1', { name: 'X' }, 'org-9'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // remove
  // ---------------------------------------------------------------------------

  describe('remove', () => {
    it('removes the row, emits deletion event, invalidates cache', async () => {
      await service.remove('p-1', 'b-1', 'u-1');

      expect(boardRepo.remove).toHaveBeenCalledWith(board);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'board.event',
        expect.objectContaining({
          actorId: 'u-1',
          action: expect.stringContaining('deleted board') as string,
        }),
      );
      expect(cacheInvalidator.invalidateByTags).toHaveBeenCalledWith([
        'board:b-1',
      ]);
    });

    it('throws ForbiddenException("Only ProjectLead can delete boards") for non-lead', async () => {
      // Same two-call shape as update — see comment in the update spec above.
      members.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);
      await expect(service.remove('p-1', 'b-1', 'u-1')).rejects.toThrow(
        new ForbiddenException('Only ProjectLead can delete boards'),
      );
      expect(boardRepo.remove).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // seed (BoardSeedPort adapter)
  // ---------------------------------------------------------------------------

  describe('seed (BoardSeedPort adapter)', () => {
    it('returns { boardId } and forwards the typed columns spec through create()', async () => {
      const result = await service.seed({
        projectId: 'p-1',
        actorUserId: 'u-1',
        name: 'Templated Board',
        type: BoardType.KANBAN,
        columns: [
          { name: 'Backlog', order: 0 },
          { name: 'Active', order: 1, statusId: 'st-active' },
        ],
      });

      expect(result).toEqual({ boardId: 'new-board' });
      // Adapter forwarded the typed columns — the legacy any[] leak is closed.
      expect(txColumnRepo.create).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'board.event',
        expect.objectContaining({ boardName: 'Templated Board' }),
      );
    });

    it('falls back to default columns when spec omits them', async () => {
      const result = await service.seed({
        projectId: 'p-1',
        actorUserId: 'u-1',
        name: 'Default Board',
        type: BoardType.SCRUM,
      });

      expect(result).toEqual({ boardId: 'new-board' });
      expect(txColumnRepo.create).toHaveBeenCalledTimes(4); // SCRUM default
    });
  });
});

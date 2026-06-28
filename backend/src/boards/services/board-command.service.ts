import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';

import { BoardRepository } from '../../database/repositories/board.repository';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { CACHE_INVALIDATOR_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheInvalidator } from '../../cache/interfaces/cache.interfaces';
import { BOARD_EVENT_FACTORY_TOKEN } from '../../common/constants/events.tokens';
import type { IBoardEventFactory } from '../../common/interfaces/event-factory.interfaces';

import { Board } from '../entities/board.entity';
import { BoardColumn } from '../entities/board-column.entity';
import { BoardType } from '../enums/board-type.enum';
import { CreateBoardDto } from '../dto/create-board.dto';
import { UpdateBoardDto } from '../dto/update-board.dto';
import type { IBoardCommand } from '../interfaces/boards.interfaces';
import {
  BoardSeedPort,
  BoardSeedResult,
  BoardSeedSpec,
} from '../ports/board-seed.port';
import { BoardAuthzService } from './board-authz.service';

/**
 * BoardCommandService
 *
 * Board lifecycle write surface, bound to `BOARD_COMMAND_TOKEN`.
 * Also satisfies `BoardSeedPort` so the same instance can be bound to
 * `BOARD_SEED_PORT` via `useExisting`, breaking the legacy
 * `BoardsModule ↔ ProjectTemplatesModule` `forwardRef` cycle (step 3
 * commit 8 finishes the cycle break on the consumer side).
 *
 * Transactional `create`
 * ----------------------
 * Board insert + column seeding run inside a single
 * `dataSource.transaction(...)` block — a partial seed rolls back the
 * board row, eliminating the orphan-board window that existed pre-
 * Step 2. Event emission and cache invalidation run AFTER commit, so
 * a rollback does NOT publish a `board.event` for a row that never
 * existed.
 *
 * `seed()` adapter
 * ----------------
 * `BoardSeedPort.seed(spec)` is implemented as a thin adapter over
 * `create(projectId, userId, dto, …)`. It rebuilds the legacy
 * `CreateBoardDto` shape (typed columns array) from the strongly-
 * typed `BoardSeedSpec`. Returning `{ boardId }` rather than the
 * full board view is intentional — templates only need the id to
 * persist the project linkage.
 *
 * Class extension
 * ---------------
 * `extends BoardSeedPort` (abstract class) lets NestJS resolve the
 * binding by reference identity on the class symbol. Mirrors the
 * `TemplateApplicationService extends TemplateApplicationPort`
 * precedent that broke the equivalent cycle in `projects`.
 */
@Injectable()
export class BoardCommandService
  extends BoardSeedPort
  implements IBoardCommand
{
  private readonly logger = new Logger(BoardCommandService.name);

  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly authz: BoardAuthzService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly cacheInvalidator: ICacheInvalidator,
    @Inject(BOARD_EVENT_FACTORY_TOKEN)
    private readonly boardEventFactory: IBoardEventFactory,
  ) {
    super();
  }

  // ---------------------------------------------------------------------------
  // IBoardCommand
  // ---------------------------------------------------------------------------

  async create(
    projectId: string,
    userId: string,
    dto: CreateBoardDto,
    organizationId?: string,
  ): Promise<Board> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId, ...(organizationId && { organizationId }) },
    });
    if (!project) throw new NotFoundException('Project not found');

    await this.authz.requireLead(projectId, userId, 'create boards');

    const { columns, ...boardData } = dto;

    const saved = await this.dataSource.transaction(async (manager) => {
      const board = manager
        .getRepository(Board)
        .create({ projectId, ...boardData });
      const persistedBoard = await manager.getRepository(Board).save(board);

      const colRepoTx = manager.getRepository(BoardColumn);
      let cols: BoardColumn[];
      if (columns && columns.length > 0) {
        cols = columns.map(
          (col: { name: string; order: number; statusId?: string }) =>
            colRepoTx.create({
              boardId: persistedBoard.id,
              name: col.name,
              columnOrder: col.order,
              statusId: col.statusId,
            }),
        );
      } else {
        const defaults = {
          [BoardType.KANBAN]: ['To Do', 'In Progress', 'Done'],
          [BoardType.SCRUM]: [
            'Backlog',
            'Selected for Development',
            'In Progress',
            'Done',
          ],
        }[persistedBoard.type];
        cols = defaults.map((name, idx) =>
          colRepoTx.create({
            boardId: persistedBoard.id,
            name,
            columnOrder: idx,
          }),
        );
      }

      const persistedCols = await colRepoTx.save(cols);
      persistedBoard.columns = persistedCols;
      return persistedBoard;
    });

    const boardPayload = this.boardEventFactory.create({
      projectId,
      actorId: userId,
      action: `created board ${saved.name}`,
      boardName: saved.name,
      boardId: saved.id,
    });
    this.eventEmitter.emit('board.event', boardPayload);

    await this.invalidateBoardCache(saved.id);

    return saved;
  }

  async update(
    projectId: string,
    boardId: string,
    userId: string,
    dto: UpdateBoardDto,
    organizationId?: string,
  ): Promise<Board> {
    const board = await this.loadBoardAndAuthorize(
      projectId,
      boardId,
      userId,
      organizationId,
      'update boards',
    );

    Object.assign(board, dto);
    const updated = await this.boardRepo.save(board);

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `updated board ${updated.name} `,
      actorId: userId,
      boardName: updated.name,
    });

    await this.invalidateBoardCache(boardId);

    return updated;
  }

  async remove(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    const board = await this.loadBoardAndAuthorize(
      projectId,
      boardId,
      userId,
      organizationId,
      'delete boards',
    );

    await this.boardRepo.remove(board);

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `deleted board ${board.name} `,
      actorId: userId,
      boardName: board.name,
    });

    await this.invalidateBoardCache(boardId);
  }

  // ---------------------------------------------------------------------------
  // BoardSeedPort
  // ---------------------------------------------------------------------------

  /**
   * Adapt the templated seed spec onto the transactional `create()`.
   *
   * Template authors call this from `template-application.service.ts`
   * and `project-wizard.service.ts` (commit 8) without ever touching
   * the concrete `BoardsService` — closing the
   * `BoardsModule ↔ ProjectTemplatesModule` `forwardRef` cycle.
   *
   * The columns array shape `{ name, order, statusId? }` maps 1:1 to
   * the legacy `CreateBoardDto.columns` shape — no schema gymnastics.
   */
  async seed(spec: BoardSeedSpec): Promise<BoardSeedResult> {
    const dto: CreateBoardDto = {
      name: spec.name,
      type: spec.type,
      description: spec.description,
      columns: spec.columns?.map((col) => ({
        name: col.name,
        order: col.order,
        statusId: col.statusId,
      })),
    } as CreateBoardDto;

    const board = await this.create(spec.projectId, spec.actorUserId, dto);
    return { boardId: board.id };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Load + tenant + dual role gate (member then lead) — preserves the
   * legacy HTTP-error-message ordering used by update/remove.
   */
  private async loadBoardAndAuthorize(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId: string | undefined,
    action: string,
  ): Promise<Board> {
    const board = await this.boardRepo.findScopedWithColumnsAndProject(
      projectId,
      boardId,
    );
    if (!board) throw new NotFoundException('Board not found');
    if (organizationId && board.project.organizationId !== organizationId) {
      throw new NotFoundException('Board not found');
    }
    await this.authz.requireMember(projectId, userId);
    await this.authz.requireLead(projectId, userId, action);
    return board;
  }

  /**
   * Fire-and-forget cache invalidation — Redis outages MUST NOT fail
   * user mutations. Identical policy to the column command service.
   */
  private async invalidateBoardCache(boardId: string): Promise<void> {
    try {
      await this.cacheInvalidator.invalidateByTags([`board:${boardId}`]);
      this.logger.debug(`Cache invalidated for board:${boardId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Cache invalidation failed for board:${boardId}: ${message}`,
      );
    }
  }
}

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { BoardRepository } from '../../database/repositories/board.repository';
import { BoardColumnRepository } from '../../database/repositories/board-column.repository';
import { CACHE_INVALIDATOR_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheInvalidator } from '../../cache/interfaces/cache.interfaces';

import { Board } from '../entities/board.entity';
import { BoardColumn } from '../entities/board-column.entity';
import { CreateColumnDto } from '../dto/create-column.dto';
import { UpdateColumnDto } from '../dto/update-column.dto';
import type { IBoardColumnCommand } from '../interfaces/boards.interfaces';
import { BoardAuthzService } from './board-authz.service';

/**
 * BoardColumnCommandService
 *
 * Sub-aggregate write surface for `BoardColumn`. Bound to
 * `BOARD_COLUMN_COMMAND_TOKEN`. Owns add/update/remove for columns.
 *
 * Behavior parity with the legacy `BoardsService` god class:
 *   - Two-stage authorization: `requireMember` first (matches the
 *     legacy `findOne` precondition), then `requireLead(action)` with
 *     the legacy per-route action verb so HTTP error strings are
 *     unchanged.
 *   - `board.event` audit emission AFTER the DB write commits.
 *   - Cache invalidation (`board:{id}` tag) AFTER commit,
 *     fire-and-forget — a Redis outage MUST NOT fail the user's
 *     mutation.
 *
 * Outbound dependencies:
 *   - `BoardRepository` — for the load+tenant gate on the parent
 *     board (mirrors the legacy `findOne` call).
 *   - `BoardColumnRepository` — abstract DIP token for column
 *     persistence. The concrete TypeORM impl owns the bulk-reorder
 *     SQL (`BoardOrderingService` is the only caller of bulkReorder;
 *     this service only mutates single rows).
 *   - `BoardAuthzService` — shared role-check helper introduced in
 *     commit 1.
 *   - `EventEmitter2` + `ICacheInvalidator` — audit + cache fanout.
 */
@Injectable()
export class BoardColumnCommandService implements IBoardColumnCommand {
  private readonly logger = new Logger(BoardColumnCommandService.name);

  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly columnRepo: BoardColumnRepository,
    private readonly authz: BoardAuthzService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly cacheInvalidator: ICacheInvalidator,
  ) {}

  async addColumn(
    projectId: string,
    boardId: string,
    userId: string,
    dto: CreateColumnDto,
    organizationId?: string,
  ): Promise<BoardColumn> {
    const board = await this.loadBoardAndAuthorize(
      projectId,
      boardId,
      userId,
      organizationId,
      'add columns',
    );

    const col = this.columnRepo.create({ boardId, ...dto });
    const saved = await this.columnRepo.save(col);

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `added column ${saved.name} to board ${board.name} `,
      actorId: userId,
      boardName: board.name,
      columnName: saved.name,
    });

    await this.invalidateBoardCache(boardId);

    return saved;
  }

  async updateColumn(
    projectId: string,
    boardId: string,
    colId: string,
    userId: string,
    dto: UpdateColumnDto,
    organizationId?: string,
  ): Promise<BoardColumn> {
    const board = await this.loadBoardAndAuthorize(
      projectId,
      boardId,
      userId,
      organizationId,
      'update columns',
    );

    const col = await this.columnRepo.findOneByBoard(boardId, colId);
    if (!col) throw new NotFoundException('Column not found');
    Object.assign(col, dto);
    const updated = await this.columnRepo.save(col);

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `updated column ${updated.name} `,
      actorId: userId,
      boardName: board.name,
      columnName: updated.name,
    });

    await this.invalidateBoardCache(boardId);

    return updated;
  }

  async removeColumn(
    projectId: string,
    boardId: string,
    colId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    const board = await this.loadBoardAndAuthorize(
      projectId,
      boardId,
      userId,
      organizationId,
      'remove columns',
    );

    const col = await this.columnRepo.findOneByBoard(boardId, colId);
    if (!col) throw new NotFoundException('Column not found');
    await this.columnRepo.remove(col);

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `deleted column ${col.name} from board`,
      actorId: userId,
      boardName: board.name,
      columnName: col.name,
    });

    await this.invalidateBoardCache(boardId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Load the parent board and enforce the tenant + role gate.
   *
   * Mirrors the legacy `BoardsService.findOne(...) + role===LEAD`
   * combo verbatim — two membership lookups in sequence so the
   * "Not a project member" message fires before "Only ProjectLead
   * can …" when the caller has no role at all.
   *
   * @param action Legacy per-route verb (`'add columns'`,
   *               `'update columns'`, `'remove columns'`).
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
   * Invalidate the `board:{id}` cache tag.
   *
   * Fire-and-forget: Redis outages MUST NOT fail user mutations
   * (matches the legacy `BoardsService.invalidateBoardCache` policy).
   * Cache invalidation timing: AFTER DB commit so we do not publish a
   * stale-eviction signal for a row that never persisted.
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

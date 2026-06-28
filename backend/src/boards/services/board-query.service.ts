import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { BoardRepository } from '../../database/repositories/board.repository';
import { IssueRepository } from '../../database/repositories/issue.repository';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheStore } from '../../cache/interfaces/cache.interfaces';

import { Board } from '../entities/board.entity';
import type {
  IBoardQuery,
  KanbanBoardView,
  KanbanCardView,
  KanbanColumnView,
} from '../interfaces/boards.interfaces';
import { BoardAuthzService } from './board-authz.service';
import {
  groupKanbanCardsByColumn,
  toBoardSummary,
  toKanbanCardView,
} from '../mappers/board.mapper';

/**
 * BoardQueryService
 *
 * Read-side surface of the boards aggregate, bound to
 * `BOARD_QUERY_TOKEN`. Implements `IBoardQuery` exactly — the three
 * methods preserve their legacy behavior verbatim so this commit is
 * pure code motion (no semantic change).
 *
 * Return types
 * ------------
 * `findAll` / `findOne` continue to return the `Board` entity rather
 * than the narrower `BoardSummary` / `BoardWithColumns` DTOs. The
 * entity is structurally assignable to the DTO (covariance), so
 * `implements IBoardQuery` still compiles. Keeping entity returns
 * here preserves binary compatibility with the legacy callers
 * (sprints, the controller cache layer) during the multi-commit
 * migration — Step 4 can narrow if/when every consumer is on the
 * token path.
 *
 * `findOneWithIssues` returns the narrow `KanbanBoardView` because
 * the legacy implementation already constructed that exact shape
 * inline. The mapper utilities (`toBoardSummary`, `toKanbanCardView`,
 * `groupKanbanCardsByColumn`) replace the inline `{ … } as Board`
 * cast and the duplicated grouping loop.
 *
 * Cache contract
 * --------------
 * The 5-second micro-cache on `findOneWithIssues` is tagged
 * `board:{id}` + `project:{id}`. Every lifecycle / column / ordering
 * mutation in the other CQRS services MUST invalidate
 * `board:{id}` post-commit — see `BoardCommandService`,
 * `BoardColumnCommandService`, `BoardOrderingService`.
 *
 * Authorization
 * -------------
 * Member-level role check is centralized through `BoardAuthzService`.
 * The legacy code spawned `getUserRole(...)` inline at three sites;
 * this service collapses them to one call site per method.
 */
@Injectable()
export class BoardQueryService implements IBoardQuery {
  private readonly logger = new Logger(BoardQueryService.name);

  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly issueRepo: IssueRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly authz: BoardAuthzService,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
  ) {}

  /**
   * List every board owned by the project. Eager-loads the `columns`
   * relation so the controller's slim list view can sort + render in
   * one shot.
   *
   * Behavior parity: when `organizationId` is supplied, the project
   * lookup is scoped to it BEFORE the membership check — preserves
   * the legacy 404-vs-403 ordering (tenant-mismatch boards return
   * `NotFoundException`, not `ForbiddenException`).
   */
  async findAll(
    projectId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Board[]> {
    if (organizationId) {
      const project = await this.projectRepo.findOne({
        where: { id: projectId, organizationId },
      });
      if (!project) throw new NotFoundException('Project not found');
    }
    await this.authz.requireMember(projectId, userId);
    return this.boardRepo.findByProject(projectId, {
      relations: ['columns'],
    });
  }

  /**
   * Load one board (with columns + project) for the supplied member.
   *
   * Tenant-isolation pattern: the repository finder is project-scoped
   * already, but `organizationId` (if supplied) acts as a tenant
   * guardrail by validating `board.project.organizationId`. A
   * mismatch returns `NotFoundException` rather than leaking that the
   * board exists in another tenant.
   *
   * Side effect: sorts `board.columns` in-place by `columnOrder`
   * ascending. Preserved verbatim from the god class — the controller
   * relies on this ordering and downstream services that pass the
   * board to their consumers depend on it too.
   */
  async findOne(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId?: string,
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
    board.columns.sort((a, b) => a.columnOrder - b.columnOrder);
    return board;
  }

  /**
   * Primary Kanban endpoint — returns board + columns + slim issues.
   *
   * Performance contract (legacy verbatim):
   *   1. 5-second micro-cache keyed `board:{id}:slim` to absorb the
   *      standup refresh storm. Tagged `board:{id}` + `project:{id}`
   *      so lifecycle / column / ordering mutations invalidate it.
   *   2. SELECT-narrowed issue projection (heavy fields excluded)
   *      — encapsulated inside `IssueRepository.findKanbanCards`.
   *   3. Single grouping pass via `groupKanbanCardsByColumn` —
   *      primary match on `statusId`, fallback on column name for
   *      pre-relational-status legacy data.
   *
   * DTO-narrow return: emits `KanbanBoardView` directly (no entity
   * leak). The mapper utilities replace the inline construction at
   * the legacy site.
   */
  async findOneWithIssues(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId?: string,
  ): Promise<KanbanBoardView> {
    const cacheKey = `board:${boardId}:slim`;
    const cached = await this.cacheStore.get<KanbanBoardView>(cacheKey, {
      namespace: 'boards',
    });
    if (cached) {
      this.logger.debug(`Cache HIT for board ${boardId}`);
      return cached;
    }

    const board = await this.boardRepo.findScopedWithColumnsAndProject(
      projectId,
      boardId,
    );
    if (!board) throw new NotFoundException('Board not found');

    if (organizationId && board.project.organizationId !== organizationId) {
      throw new NotFoundException('Board not found');
    }

    await this.authz.requireMember(projectId, userId);

    const cards = await this.issueRepo.findKanbanCards(projectId);
    const groupedByColumnId = groupKanbanCardsByColumn(board.columns, cards);

    const sortedColumns: KanbanColumnView[] = [...board.columns]
      .sort((a, b) => a.columnOrder - b.columnOrder)
      .map((col) => {
        const colCards = groupedByColumnId.get(col.id) ?? [];
        const issues: KanbanCardView[] = colCards.map(toKanbanCardView);
        return {
          id: col.id,
          name: col.name,
          statusId: col.statusId ?? null,
          columnOrder: col.columnOrder,
          issues,
        };
      });

    const result: KanbanBoardView = {
      board: toBoardSummary(board),
      columns: sortedColumns,
    };

    await this.cacheStore.set(cacheKey, result, {
      ttl: 5,
      namespace: 'boards',
      tags: [`board:${boardId}`, `project:${projectId}`],
    });
    this.logger.debug(`Cache SET for board ${boardId} (TTL: 5s)`);
    return result;
  }
}

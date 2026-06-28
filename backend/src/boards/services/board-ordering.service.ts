import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { BoardRepository } from '../../database/repositories/board.repository';
import { BoardColumnRepository } from '../../database/repositories/board-column.repository';
import { IssueRepository } from '../../database/repositories/issue.repository';
import { CACHE_INVALIDATOR_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheInvalidator } from '../../cache/interfaces/cache.interfaces';
import { BoardGateway } from '../../gateways/board.gateway';

import { Board } from '../entities/board.entity';
import type { IBoardOrderingCommand } from '../interfaces/boards.interfaces';
import { WorkflowLookupPort } from '../ports/workflow-lookup.port';
import { BoardAuthzService } from './board-authz.service';

/**
 * BoardOrderingService
 *
 * Drag-and-drop realtime ordering surface, bound to
 * `BOARD_ORDERING_COMMAND_TOKEN`. Three operations:
 *
 *   - `reorderColumns` — bulk-reorder columns within a board
 *     (ProjectLead only; protects against accidental rearrangement)
 *   - `moveIssue` — relocate an issue across status columns and
 *     update its lexical order
 *   - `reorderIssues` — bulk-reorder issues within a column
 *
 * Why a separate service from `BoardCommandService`?
 * ---------------------------------------------------
 * These operations emit to `BoardGateway` (realtime WebSocket
 * broadcast) instead of `EventEmitter2` (audit feed). The two
 * downstream contracts are structurally different: gateway events
 * carry full row snapshots for optimistic-UI reconciliation, while
 * `board.event` payloads are append-only audit records. Keeping
 * them in distinct services lets each evolve its payload shape
 * without forcing the other to widen.
 *
 * Authorization pattern
 * ---------------------
 *   - `reorderColumns` — `requireMember` then `requireLead('reorder
 *     columns')`. Matches the legacy two-stage gate from
 *     `BoardsService` so the HTTP error string ordering is preserved.
 *   - `moveIssue` and `reorderIssues` — member-only (any project
 *     member may move issues during a sprint). The membership check
 *     is performed inside `loadBoardAndAuthorizeMember` via the
 *     parent board load.
 *
 * Bulk-DML safety rail
 * --------------------
 * Both bulk operations reject orderings of > 5000 items with a
 * `ForbiddenException` — guards against pathological inputs that
 * would degrade Postgres into a row-level lock storm.
 *
 * Outbound DIP cleanup
 * --------------------
 *   - `WorkflowLookupPort` replaces the pre-Step-2
 *     `dataSource.getRepository(WorkflowStatus)` leak in `moveIssue`.
 *   - Both bulk-update SQLs live inside `TypeOrmBoardColumnRepository
 *     .bulkReorder` and `TypeOrmIssueRepository.bulkReorderInColumn`
 *     respectively — this service speaks only abstract repository
 *     calls.
 */
@Injectable()
export class BoardOrderingService implements IBoardOrderingCommand {
  private readonly logger = new Logger(BoardOrderingService.name);

  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly columnRepo: BoardColumnRepository,
    private readonly issueRepo: IssueRepository,
    private readonly authz: BoardAuthzService,
    private readonly workflowLookup: WorkflowLookupPort,
    private readonly boardGateway: BoardGateway,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly cacheInvalidator: ICacheInvalidator,
  ) {}

  async reorderColumns(
    projectId: string,
    boardId: string,
    orderedColumnIds: string[],
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    await this.loadBoardAndAuthorizeLead(
      projectId,
      boardId,
      userId,
      organizationId,
      'reorder columns',
    );

    if (orderedColumnIds.length === 0) return;
    if (orderedColumnIds.length > 5000) {
      throw new ForbiddenException(
        'Cannot reorder more than 5000 columns at once',
      );
    }

    await this.columnRepo.bulkReorder(boardId, orderedColumnIds);

    this.boardGateway.emitColumnsReordered(boardId, {
      projectId,
      boardId,
      orderedColumnIds,
    });

    await this.invalidateBoardCache(boardId);
  }

  async moveIssue(
    projectId: string,
    boardId: string,
    issueId: string,
    toStatusId: string,
    newOrder: number,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    await this.loadBoardAndAuthorizeMember(
      projectId,
      boardId,
      userId,
      organizationId,
    );

    const workflowStatus = await this.workflowLookup.findStatus(
      projectId,
      toStatusId,
    );
    if (!workflowStatus) {
      throw new NotFoundException(
        `WorkflowStatus not found: ${toStatusId}. Cannot update issue status.`,
      );
    }

    const result = await this.issueRepo.moveToStatus(
      projectId,
      issueId,
      toStatusId,
      workflowStatus.name,
      newOrder,
    );
    if (!result) throw new NotFoundException('Issue not found');

    const { issue, prevStatusId } = result;

    this.boardGateway.emitIssueMoved(boardId, {
      userId,
      userName: '',
      timestamp: new Date().toISOString(),
      issueId,
      issue: {
        id: issue.id,
        title: issue.title,
        number: issue.number ?? null,
        status: issue.status,
        statusId: issue.statusId ?? '',
        priority: String(issue.priority),
        type: String(issue.type),
        assigneeId: issue.assigneeId ?? null,
        lexorank: '',
        storyPoints: issue.storyPoints,
      },
      fromColumnId: prevStatusId ?? '',
      toColumnId: toStatusId,
      newIndex: newOrder,
      boardId,
      projectId,
    });

    await this.invalidateBoardCache(boardId);
  }

  async reorderIssues(
    projectId: string,
    boardId: string,
    columnId: string,
    orderedIssueIds: string[],
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    await this.loadBoardAndAuthorizeMember(
      projectId,
      boardId,
      userId,
      organizationId,
    );

    if (orderedIssueIds.length === 0) return;
    if (orderedIssueIds.length > 5000) {
      throw new ForbiddenException(
        'Cannot reorder more than 5000 issues at once',
      );
    }

    await this.issueRepo.bulkReorderInColumn(
      projectId,
      columnId,
      orderedIssueIds,
    );

    this.boardGateway.emitIssueReordered(boardId, {
      projectId,
      boardId,
      columnId,
      issues: orderedIssueIds,
    });

    await this.invalidateBoardCache(boardId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Member-only load+tenant gate. Matches the legacy
   * `BoardsService.findOne(...)` precondition used by `moveIssue`
   * and `reorderIssues`.
   */
  private async loadBoardAndAuthorizeMember(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId: string | undefined,
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
    return board;
  }

  /**
   * Two-stage gate: member then lead. Used by `reorderColumns`.
   * Preserves the legacy HTTP error string ordering: "Not a project
   * member" fires before "Only ProjectLead can reorder columns".
   */
  private async loadBoardAndAuthorizeLead(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId: string | undefined,
    action: string,
  ): Promise<Board> {
    const board = await this.loadBoardAndAuthorizeMember(
      projectId,
      boardId,
      userId,
      organizationId,
    );
    await this.authz.requireLead(projectId, userId, action);
    return board;
  }

  /**
   * Fire-and-forget cache invalidation — identical policy to the
   * column-command service. Redis outages MUST NOT fail user
   * mutations.
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

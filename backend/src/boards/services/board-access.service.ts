import { Inject, Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';

import { BoardRepository } from '../../database/repositories/board.repository';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import type {
  BoardAccessResult,
  IBoardAccess,
} from '../interfaces/boards.interfaces';

/**
 * BoardAccessService
 *
 * Room-level authorization for the WebSocket transport. Answers one question:
 * *may this user subscribe to this board's realtime feed?*
 *
 * RELOCATED from `gateways/board-access.service.ts` (gateways Step 2).
 * ------------------------------------------------------------------
 * It held `@InjectRepository(Board)` and ran `boardRepo.findOne(...)` from
 * inside a Level-3 transport module — a direct Golden Rule violation (Level 3
 * never executes raw TypeORM). The old file carried this justification:
 *
 *   "ARCHITECTURE: Lives in GatewaysModule to avoid circular dependency.
 *    BoardsModule already depends on BoardGateway (global), so injecting
 *    BoardsService here would create: BoardsModule → GatewaysModule →
 *    BoardsModule."
 *
 * That reasoning no longer holds. `@Global()` modules create NO `imports`
 * edge — `BoardsModule` never listed `GatewaysModule`, it simply resolved
 * `BoardGateway` from the global registry. With the realtime edge now inverted
 * behind `BoardRealtimePort`, the provider graph is
 * `BoardOrderingService → BoardRealtimePort → BoardRealtimeAdapter →
 * BoardGateway → IBoardAccess` — acyclic, and the module graph gains exactly
 * one edge (`GatewaysModule → BoardsModule`). No `forwardRef`.
 *
 * Persistence goes through the abstract `BoardRepository`, per the module rule
 * that boards services "persist through abstract repositories — never via
 * `@InjectRepository(...)` or raw `DataSource` queries."
 *
 * SECURITY: anti-enumeration — the caller gets the same generic denial for
 * "board does not exist" and "not a member". The specific `reason` is carried
 * for the audit log only and must never reach the client.
 */
@Injectable()
export class BoardAccessService implements IBoardAccess {
  private readonly logger = new Logger(BoardAccessService.name);

  constructor(
    private readonly boardRepo: BoardRepository,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly projectMembers: IProjectMemberQuery,
  ) {}

  /**
   * Validate whether a user can access a specific board.
   *
   * Performance: two lightweight indexed reads (board PK lookup + membership
   * check). The hot path for `joinBoard`, which only ever has one board.
   */
  async validateAccess(
    userId: string,
    boardId: string,
  ): Promise<BoardAccessResult> {
    // Step 1: Lightweight board existence check (select only needed columns)
    const board = await this.boardRepo.findOne({
      where: { id: boardId },
      select: ['id', 'projectId'],
    });

    if (!board) {
      this.logger.warn(
        `[SECURITY] Board access denied: User ${userId} → Board ${boardId} (reason: board_not_found)`,
      );
      return { granted: false, reason: 'board_not_found' };
    }

    // Step 2: Verify user is a member of the owning project
    const role = await this.projectMembers.getUserRole(board.projectId, userId);

    return this.decide(userId, boardId, board.projectId, role);
  }

  /**
   * Batch authorization for reconnect.
   *
   * WHY THIS EXISTS: `BoardGateway.restoreRooms` used to call
   * `validateAccess` once per stored room, sequentially awaited inside
   * `handleConnection`. A user in N boards paid 2N serial round trips before
   * their socket became usable — on every reconnect, which for mobile clients
   * is constantly. This collapses it to ONE board query plus one membership
   * lookup per DISTINCT project (in practice: one).
   *
   * Every requested id appears in the returned map, denied ones included, so
   * the caller can leave stale rooms without a second pass.
   */
  async validateAccessBatch(
    userId: string,
    boardIds: readonly string[],
  ): Promise<ReadonlyMap<string, BoardAccessResult>> {
    const results = new Map<string, BoardAccessResult>();
    if (boardIds.length === 0) return results;

    // De-duplicate before hitting the DB — socket.io can hand us repeats.
    const unique = [...new Set(boardIds)];

    // ONE query for the whole set.
    const boards = await this.boardRepo.findMany({
      where: { id: In(unique) },
      select: ['id', 'projectId'],
    });

    const projectByBoard = new Map(boards.map((b) => [b.id, b.projectId]));

    // ONE membership lookup per DISTINCT project, resolved in parallel.
    // Almost always a single project, so this is one round trip.
    const distinctProjects = [...new Set(projectByBoard.values())];
    const roleEntries = await Promise.all(
      distinctProjects.map(
        async (projectId) =>
          [
            projectId,
            await this.projectMembers.getUserRole(projectId, userId),
          ] as const,
      ),
    );
    const roleByProject = new Map(roleEntries);

    for (const boardId of unique) {
      const projectId = projectByBoard.get(boardId);

      if (!projectId) {
        this.logger.warn(
          `[SECURITY] Board access denied: User ${userId} → Board ${boardId} (reason: board_not_found)`,
        );
        results.set(boardId, { granted: false, reason: 'board_not_found' });
        continue;
      }

      results.set(
        boardId,
        this.decide(userId, boardId, projectId, roleByProject.get(projectId)),
      );
    }

    return results;
  }

  /**
   * Board ids owned by a project.
   *
   * System fan-out only (a domain event broadcasting to every board room of a
   * project). No acting user, therefore no membership check — see the contract
   * note on `IBoardAccess.listBoardIdsForProject`.
   */
  async listBoardIdsForProject(projectId: string): Promise<readonly string[]> {
    const boards = await this.boardRepo.findByProject(projectId, {
      select: ['id'],
    });
    return boards.map((board) => board.id);
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  /**
   * Shared grant/deny decision + audit log, so the single and batch paths
   * cannot drift into logging or returning different things for the same
   * facts.
   */
  private decide(
    userId: string,
    boardId: string,
    projectId: string,
    role: ProjectRole | null | undefined,
  ): BoardAccessResult {
    if (!role) {
      this.logger.warn(
        `[SECURITY] Board access denied: User ${userId} → Board ${boardId} ` +
          `(reason: not_member, projectId: ${projectId})`,
      );
      return { granted: false, projectId, reason: 'not_member' };
    }

    this.logger.debug(
      `Board access granted: User ${userId} → Board ${boardId} (role: ${role})`,
    );

    return { granted: true, role, projectId };
  }
}

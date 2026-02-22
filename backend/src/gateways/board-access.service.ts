import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Board } from '../boards/entities/board.entity';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { ProjectRole } from '../membership/enums/project-role.enum';

/**
 * Result of a board access validation check.
 *
 * Returns a rich object (not just boolean) so the caller can:
 * - Log the specific denial reason for security auditing
 * - Include the user's role in room-join acknowledgements
 */
export interface BoardAccessResult {
  /** Whether the user is authorized to access the board */
  granted: boolean;

  /** User's role in the project (only present when granted) */
  role?: ProjectRole;

  /** Project that owns the board (only present when board exists) */
  projectId?: string;

  /** Machine-readable denial reason for structured logging */
  reason?: 'board_not_found' | 'not_member';
}

/**
 * BoardAccessService
 *
 * Focused service for WebSocket room-level authorization.
 * Validates that a user has access to a specific board by:
 * 1. Checking board existence (lightweight indexed query)
 * 2. Verifying project membership via ProjectMembersService
 *
 * ARCHITECTURE: Lives in GatewaysModule to avoid circular dependency.
 * BoardsModule already depends on BoardGateway (global), so injecting
 * BoardsService here would create: BoardsModule → GatewaysModule → BoardsModule.
 *
 * SECURITY: Uses anti-enumeration pattern — same generic denial for
 * "board not found" and "no access" (but logs the specific reason).
 */
@Injectable()
export class BoardAccessService {
  private readonly logger = new Logger(BoardAccessService.name);

  constructor(
    @InjectRepository(Board)
    private readonly boardRepo: Repository<Board>,
    private readonly projectMembersService: ProjectMembersService,
  ) {}

  /**
   * Validate whether a user can access a specific board.
   *
   * @param userId - ID of the authenticated user
   * @param boardId - ID of the board to access
   * @returns BoardAccessResult with grant status and metadata
   *
   * Performance: Two lightweight indexed queries (board lookup + membership check).
   * No event loop blocking — all calls are async.
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
    const role = await this.projectMembersService.getUserRole(
      board.projectId,
      userId,
    );

    if (!role) {
      this.logger.warn(
        `[SECURITY] Board access denied: User ${userId} → Board ${boardId} ` +
          `(reason: not_member, projectId: ${board.projectId})`,
      );
      return {
        granted: false,
        projectId: board.projectId,
        reason: 'not_member',
      };
    }

    // Step 3: Access granted
    this.logger.debug(
      `Board access granted: User ${userId} → Board ${boardId} (role: ${role})`,
    );

    return {
      granted: true,
      role,
      projectId: board.projectId,
    };
  }
}

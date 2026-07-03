import { Injectable, Logger } from '@nestjs/common';

// Sealed-barrel consumption: the port comes from `issues/index.ts`.
import { IssueBroadcastPort } from '../../issues';
import { BoardRepository } from '../../database/repositories/board.repository';
import { BoardGateway } from '../board.gateway';

/**
 * IssueBroadcastAdapter — capability-owner side of the issues → realtime
 * inversion.
 *
 * Implements the issues-owned `IssueBroadcastPort`, absorbing the board
 * enumeration (`BoardRepository.findByProject`) + per-room socket emit loop
 * that previously lived inside `IssuesService.broadcastToBoards`. Bound +
 * re-exported by the `@Global GatewaysModule`, which owns `BoardGateway`;
 * `BoardRepository` is supplied by the `@Global DatabaseModule`.
 *
 * Best-effort: socket failures are logged, never thrown, so a realtime
 * hiccup cannot fail the originating issue mutation (verbatim with the old
 * try/catch around the emit loop).
 */
@Injectable()
export class IssueBroadcastAdapter extends IssueBroadcastPort {
  private readonly logger = new Logger(IssueBroadcastAdapter.name);

  constructor(
    private readonly boards: BoardRepository,
    private readonly gateway: BoardGateway,
  ) {
    super();
  }

  async broadcastToProjectBoards(
    projectId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    try {
      const boards = await this.boards.findByProject(projectId);
      for (const board of boards) {
        this.gateway.server.to(`board:${board.id}`).emit(event, payload);
      }
    } catch (e) {
      // Don't fail the request if socket emission fails.
      this.logger.error('Failed to broadcast to boards', e as Error);
    }
  }
}

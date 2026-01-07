import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import {
  IssueMovedPayload,
  IssueCreatedPayload,
  IssueUpdatedPayload,
  IssueDeletedPayload,
} from './dto/board-events.dto';

@WebSocketGateway({
  namespace: 'boards',
  cors: {
    origin: '*', // Configure appropriately for production
  },
})
@UseGuards(WsJwtGuard)
export class BoardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BoardGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinBoard')
  async handleJoinBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { boardId: string },
  ) {
    const { boardId } = data;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = (client.data?.user?.sub as string) || 'unknown';

    if (!boardId) {
      this.logger.warn(`Client ${client.id} tried to join without boardId`);
      return;
    }

    const roomName = `board:${boardId}`;
    await client.join(roomName);
    this.logger.log(`User ${userId} joined room: ${roomName}`);

    return { event: 'joined', room: roomName };
  }

  @SubscribeMessage('leaveBoard')
  async handleLeaveBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { boardId: string },
  ) {
    const { boardId } = data;
    if (!boardId) return;

    const roomName = `board:${boardId}`;
    await client.leave(roomName);
    this.logger.log(`Client ${client.id} left room: ${roomName}`);

    return { event: 'left', room: roomName };
  }

  // ============================================================
  // EMIT METHODS - Called by services to broadcast changes
  // These enable "delta updates" instead of full refetch
  // ============================================================

  /**
   * Emit issue moved event to all clients in the board room
   * Clients update their React Query cache directly (no refetch)
   */
  emitIssueMoved(boardId: string, payload: IssueMovedPayload) {
    const roomName = `board:${boardId}`;
    this.server.to(roomName).emit('issue-moved', payload);
    this.logger.debug(`Emitted issue-moved to ${roomName}: ${payload.issueId}`);
  }

  /**
   * Emit issue created event
   */
  emitIssueCreated(boardId: string, payload: IssueCreatedPayload) {
    const roomName = `board:${boardId}`;
    this.server.to(roomName).emit('issue-created', payload);
    this.logger.debug(
      `Emitted issue-created to ${roomName}: ${payload.issue.id}`,
    );
  }

  /**
   * Emit issue updated event (title, description, priority, etc.)
   */
  emitIssueUpdated(boardId: string, payload: IssueUpdatedPayload) {
    const roomName = `board:${boardId}`;
    this.server.to(roomName).emit('issue-updated', payload);
    this.logger.debug(
      `Emitted issue-updated to ${roomName}: ${payload.issueId}`,
    );
  }

  /**
   * Emit issue deleted event
   */
  emitIssueDeleted(boardId: string, payload: IssueDeletedPayload) {
    const roomName = `board:${boardId}`;
    this.server.to(roomName).emit('issue-deleted', payload);
    this.logger.debug(
      `Emitted issue-deleted to ${roomName}: ${payload.issueId}`,
    );
  }
}

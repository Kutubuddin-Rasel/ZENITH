import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/boards',
  cors: { origin: '*' }, // adjust for production
})
export class BoardsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // Track which socket is in which project/board room
  handleConnection(socket: Socket) {
    // Client should join a project/board room after connecting
    socket.on('join-board', ({ projectId, boardId }) => {
      if (projectId && boardId) {
        socket.join(`project:${projectId}:board:${boardId}`);
      }
    });
    socket.on('leave-board', ({ projectId, boardId }) => {
      if (projectId && boardId) {
        socket.leave(`project:${projectId}:board:${boardId}`);
      }
    });
  }

  handleDisconnect(socket: Socket) {
    // No-op for now; could clean up if tracking sockets
  }

  /** Emit when an issue is moved between columns */
  emitIssueMoved({
    projectId,
    boardId,
    issueId,
    fromColumn,
    toColumn,
    newOrder,
  }) {
    this.server
      .to(`project:${projectId}:board:${boardId}`)
      .emit('issue-moved', {
        projectId,
        boardId,
        issueId,
        fromColumn,
        toColumn,
        newOrder,
      });
  }

  /** Emit when issues are reordered within a column */
  emitIssueReordered({ projectId, boardId, columnId, issues }) {
    this.server
      .to(`project:${projectId}:board:${boardId}`)
      .emit('issue-reordered', {
        projectId,
        boardId,
        columnId,
        issues, // array of issueIds in new order
      });
  }
}

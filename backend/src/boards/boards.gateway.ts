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
    socket.on(
      'join-board',
      ({ projectId, boardId }: { projectId?: string; boardId?: string }) => {
        if (projectId && boardId) {
          void socket.join(`project:${projectId}:board:${boardId}`);
        }
      },
    );
    socket.on(
      'leave-board',
      ({ projectId, boardId }: { projectId?: string; boardId?: string }) => {
        if (projectId && boardId) {
          void socket.leave(`project:${projectId}:board:${boardId}`);
        }
      },
    );
  }

  handleDisconnect() {
    // No-op for now; could clean up if tracking sockets
  }

  /** Emit when an issue is moved between columns */
  emitIssueMoved({
    projectId,
    boardId,
    issueId,
    fromStatusId,
    toStatusId,
    fromColumn,
    toColumn,
    newOrder,
  }: {
    projectId: string;
    boardId: string;
    issueId: string;
    fromStatusId?: string | null; // New: relational status ID
    toStatusId?: string; // New: relational status ID
    fromColumn?: string; // Legacy: column name string
    toColumn?: string; // Legacy: column name string
    newOrder: number;
  }) {
    this.server
      .to(`project:${projectId}:board:${boardId}`)
      .emit('issue-moved', {
        projectId,
        boardId,
        issueId,
        fromStatusId,
        toStatusId,
        fromColumn,
        toColumn,
        newOrder,
      });
  }


  /** Emit when issues are reordered within a column */
  emitIssueReordered({
    projectId,
    boardId,
    columnId,
    issues,
  }: {
    projectId: string;
    boardId: string;
    columnId: string;
    issues: string[];
  }) {
    this.server
      .to(`project:${projectId}:board:${boardId}`)
      .emit('issue-reordered', {
        projectId,
        boardId,
        columnId,
        issues, // array of issueIds in new order
      });
  }

  /** Emit when columns are reordered on a board */
  emitColumnsReordered({
    projectId,
    boardId,
    orderedColumnIds,
  }: {
    projectId: string;
    boardId: string;
    orderedColumnIds: string[];
  }) {
    this.server
      .to(`project:${projectId}:board:${boardId}`)
      .emit('columns-reordered', {
        projectId,
        boardId,
        orderedColumnIds,
      });
  }
}

// src/notifications/notifications.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer() server: Server;

  // NOTE: We no longer use an in-memory Map!
  // Socket.io rooms + Redis adapter handle user->socket mapping

  handleConnection(socket: Socket) {
    socket.on('authenticate', (userId: string) => {
      // Validate userId (basic check)
      if (!userId || typeof userId !== 'string') {
        this.logger.warn(`Invalid userId on authenticate: ${userId}`);
        return;
      }

      // Join a room named after the userId
      // Redis adapter syncs this across all server instances
      void socket.join(`user:${userId}`);
      this.logger.log(`User ${userId} connected and joined room (socket: ${socket.id})`);

      // Acknowledge successful authentication
      socket.emit('authenticated', { userId, socketId: socket.id });
    });
  }

  handleDisconnect(socket: Socket) {
    // Socket.io automatically handles room cleanup on disconnect
    // Redis adapter syncs this across all instances
    this.logger.debug(`Socket disconnected: ${socket.id}`);
  }

  /** Send a notification to a user (works across all instances via Redis) */
  sendToUser(userId: string, payload: any) {
    // Emit to the room - Redis adapter broadcasts to all instances
    this.server.to(`user:${userId}`).emit('notification', payload);
  }

  /** Send deletion event to a user */
  sendDeletionToUser(userId: string, notificationIds: string[]) {
    this.server
      .to(`user:${userId}`)
      .emit('notification_deleted', { notificationIds });
  }

  /** Send update event to a user */
  sendUpdateToUser(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit('notification_updated', payload);
  }

  /** Broadcast to all connected users (e.g., maintenance notice) */
  broadcastToAll(event: string, payload: any) {
    this.server.emit(event, payload);
  }

  /** Get count of connected sockets in a user's room */
  async getUserConnectionCount(userId: string): Promise<number> {
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    return sockets.length;
  }
}


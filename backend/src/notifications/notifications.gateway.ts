// src/notifications/notifications.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*' }, // adjust origin in production
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  // Track which socket is for which user
  private userSockets = new Map<string, Socket>();

  handleConnection(socket: Socket) {
    // Expect the client to send an auth event with their userId
    socket.on('authenticate', (userId: string) => {
      this.userSockets.set(userId, socket);
    });
  }

  handleDisconnect(socket: Socket) {
    // Remove socket from any user entries
    for (const [userId, s] of this.userSockets.entries()) {
      if (s.id === socket.id) {
        this.userSockets.delete(userId);
      }
    }
  }

  /** Send a notification payload to a specific userId if connected */
  sendToUser(userId: string, payload: any) {
    const socket = this.userSockets.get(userId);
    if (socket) {
      socket.emit('notification', payload);
    }
  }

  /** Send a notification deletion event to a specific userId if connected */
  sendDeletionToUser(userId: string, notificationIds: string[]) {
    const socket = this.userSockets.get(userId);
    if (socket) {
      socket.emit('notification_deleted', { notificationIds });
    }
  }

  /** Send a notification update event to a specific userId if connected */
  sendUpdateToUser(userId: string, payload: any) {
    const socket = this.userSockets.get(userId);
    if (socket) {
      socket.emit('notification_updated', payload);
    }
  }
}

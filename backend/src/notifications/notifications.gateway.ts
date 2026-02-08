// src/notifications/notifications.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/app.config';

/**
 * JWT payload interface for type safety
 */
interface JwtPayload {
  sub: string;
  email?: string;
  iat?: number;
  exp?: number;
}

/**
 * Notifications WebSocket Gateway
 *
 * SECURITY (Phase 1): JWT-based authentication
 * - Token verification before room join
 * - userId extracted from verified JWT (not client input)
 * - Immediate disconnect on auth failure
 *
 * Enterprise Features:
 * - CORS origins configured via RedisIoAdapter (centralized)
 * - Redis adapter support for horizontal scaling
 * - User-based room management for targeted notifications
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: true, // Fallback - actual CORS configured in RedisIoAdapter
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer() server: Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) { }

  /**
   * Log gateway initialization with configured origins
   */
  afterInit() {
    const appConfig = this.configService.get<AppConfig>('app');
    const frontendUrl = appConfig?.frontendUrl || 'http://localhost:3001';
    const additionalOrigins = appConfig?.cors?.additionalOrigins || [];
    const origins = [frontendUrl, ...additionalOrigins];

    this.logger.log(
      `Notifications gateway initialized. CORS origins: ${origins.join(', ')}`,
    );
  }

  /**
   * Handle new socket connections
   *
   * SECURITY: Authentication is required via 'authenticate' event
   * Socket must send JWT token, NOT userId
   */
  handleConnection(socket: Socket) {
    socket.on('authenticate', async (payload: { token: string }) => {
      try {
        // SECURITY: Validate payload structure
        if (!payload || typeof payload.token !== 'string') {
          this.logger.warn(`Invalid auth payload from socket: ${socket.id}`);
          socket.emit('unauthorized', { message: 'Token required' });
          socket.disconnect(true);
          return;
        }

        // SECURITY: Verify JWT and extract userId from token
        // This is the ONLY secure way to identify the socket owner
        const decoded = await this.jwtService.verifyAsync<JwtPayload>(
          payload.token,
        );

        const userId = decoded.sub;
        if (!userId) {
          this.logger.warn(`JWT missing sub claim: ${socket.id}`);
          socket.emit('unauthorized', { message: 'Invalid token payload' });
          socket.disconnect(true);
          return;
        }

        // Join user-specific room (Redis adapter syncs across instances)
        await socket.join(`user:${userId}`);

        this.logger.log(
          `User ${userId} authenticated and joined room (socket: ${socket.id})`,
        );

        // Acknowledge successful authentication
        socket.emit('authenticated', { userId, socketId: socket.id });
      } catch (error) {
        // SECURITY: Token verification failed - disconnect immediately
        this.logger.warn(
          `Authentication failed for socket ${socket.id}: ${(error as Error).message}`,
        );
        socket.emit('unauthorized', {
          message: 'Authentication failed',
          reason: (error as Error).name === 'TokenExpiredError' ? 'expired' : 'invalid',
        });
        socket.disconnect(true);
      }
    });
  }

  handleDisconnect(socket: Socket) {
    // Socket.io automatically handles room cleanup on disconnect
    // Redis adapter syncs this across all instances
    this.logger.debug(`Socket disconnected: ${socket.id}`);
  }

  /** Send a notification to a user (fire-and-forget, legacy) */
  sendToUser(userId: string, payload: any) {
    // Emit to the room - Redis adapter broadcasts to all instances
    this.server.to(`user:${userId}`).emit('notification', payload);
  }

  /**
   * SECURITY (Phase 5): Send notification with delivery confirmation
   *
   * At-Least-Once semantics:
   * - 2000ms timeout for mobile latency tolerance
   * - Client must ACK to confirm receipt
   * - Calls onDeliveryResult callback with status
   */
  async sendToUserWithAck(
    userId: string,
    notificationId: string,
    payload: any,
    onDeliveryResult: (notifId: string, delivered: boolean) => Promise<void>,
  ): Promise<void> {
    const ACK_TIMEOUT_MS = 2000;

    try {
      // Get all sockets in user's room
      const sockets = await this.server.in(`user:${userId}`).fetchSockets();

      if (sockets.length === 0) {
        // No connected sockets - mark as failed
        this.logger.warn(
          `WebSocket delivery failed for user ${userId}. No connected sockets. Queueing fallback...`,
        );
        await onDeliveryResult(notificationId, false);
        return;
      }

      // Emit with ACK to all sockets in the room
      let delivered = false;

      for (const socket of sockets) {
        try {
          // Use timeout-based emit with callback
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('ACK timeout'));
            }, ACK_TIMEOUT_MS);

            socket.emit('notification', payload, (ack: boolean) => {
              clearTimeout(timeout);
              if (ack) {
                delivered = true;
                resolve();
              } else {
                reject(new Error('Client NAK'));
              }
            });
          });

          // If any socket ACKs, consider it delivered
          if (delivered) break;
        } catch {
          // Continue to next socket
          this.logger.debug(`Socket ${socket.id} failed to ACK`);
        }
      }

      if (delivered) {
        this.logger.debug(`Notification ${notificationId} delivered to user ${userId}`);
        await onDeliveryResult(notificationId, true);
      } else {
        this.logger.warn(
          `WebSocket delivery failed for user ${userId}. Queueing fallback...`,
        );
        await onDeliveryResult(notificationId, false);
      }
    } catch (error) {
      this.logger.error(`Delivery error for ${notificationId}: ${(error as Error).message}`);
      await onDeliveryResult(notificationId, false);
    }
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

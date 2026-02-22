import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseFilters } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BoardAccessService } from './board-access.service';
import { WsExceptionFilter } from './filters/ws-exception.filter';
import { SkipWsAuth } from './decorators/skip-ws-auth.decorator';
import { WsSessionStore } from './ws-session.store';
import {
  IssueMovedPayload,
  IssueCreatedPayload,
  IssueUpdatedPayload,
  IssueDeletedPayload,
  IssueReorderedPayload,
  ColumnsReorderedPayload,
} from './dto/board-events.dto';
import { JoinBoardDto, LeaveBoardDto } from './dto/join-board.dto';
import { WsTokenRefreshDto } from './dto/ws-token-refresh.dto';

/**
 * JWT Payload structure from auth service
 */
interface JwtPayload {
  sub: string;
  email: string;
  roles?: string[];
  iat?: number;
  exp?: number;
}

/**
 * Strictly typed user data attached to socket after authentication
 */
interface SocketUser {
  id: string;
  email: string;
  roles: string[];
}

/**
 * Authenticated Socket - extends Socket with strictly typed user data
 * PROHIBITION: Do not use `any` for socket clients. Use this interface.
 */
export interface AuthenticatedSocket extends Socket {
  data: {
    user: SocketUser;
  };
}

/**
 * CORS Configuration: Parse comma-separated origins from environment.
 * Example: CORS_ORIGIN=http://localhost:3000,https://app.domain.com
 *
 * SECURITY: If CORS_ORIGIN is not set, defaults to empty array (denies all).
 * This is a fail-secure approach for production deployments.
 */
const ALLOWED_ORIGINS: string[] = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [];

@UseFilters(WsExceptionFilter)
@WebSocketGateway({
  namespace: 'boards',
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
})
export class BoardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BoardGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly boardAccessService: BoardAccessService,
    private readonly wsSessionStore: WsSessionStore,
  ) {}

  /**
   * Handshake-level JWT authentication.
   * Validates token BEFORE allowing any message subscriptions.
   *
   * Security: This is the "Zero Trust" entry point - no connection
   * is allowed without valid, unexpired JWT.
   */
  async handleConnection(client: Socket): Promise<void> {
    const clientId = client.id;

    try {
      // 1. Extract token from handshake
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`Connection rejected [${clientId}]: NoTokenProvided`);
        client.disconnect(true);
        return;
      }

      // 2. Verify JWT signature and expiration
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        this.logger.error(
          `Connection rejected [${clientId}]: JwtSecretNotConfigured`,
        );
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });

      // 3. Validate payload structure
      if (!payload.sub || !payload.email) {
        this.logger.warn(
          `Connection rejected [${clientId}]: InvalidPayloadStructure`,
        );
        client.disconnect(true);
        return;
      }

      // 4. Attach strictly typed user to socket
      const authenticatedClient = client as AuthenticatedSocket;
      authenticatedClient.data = {
        user: {
          id: payload.sub,
          email: payload.email,
          roles: payload.roles || [],
        },
      };

      this.logger.log(
        `Client authenticated [${clientId}]: user=${payload.sub}`,
      );

      // 5. Auto-rejoin previous rooms (Phase 6: Connection State Recovery)
      await this.restoreRooms(authenticatedClient);
    } catch (err: unknown) {
      // Categorize error for structured logging (NEVER log the token)
      const errorType = this.categorizeJwtError(err);
      this.logger.warn(`Connection rejected [${clientId}]: ${errorType}`);

      // Forceful disconnect - closes transport immediately
      client.disconnect(true);

      // Early return after disconnect - do NOT throw after disconnect
      // as the connection is already terminated
      return;
    }
  }

  /**
   * Handle disconnect - cleanup logging
   */
  handleDisconnect(client: Socket): void {
    const authenticatedClient = client as AuthenticatedSocket;
    const userId = authenticatedClient.data?.user?.id || 'unknown';
    this.logger.log(`Client disconnected [${client.id}]: user=${userId}`);
    // NOTE: Room subscriptions are NOT cleared on disconnect.
    // The 5-minute TTL in WsSessionStore acts as a grace period.
    // If the user reconnects within 5 minutes, rooms are restored.
  }

  /**
   * Restore previous room subscriptions after reconnection.
   *
   * SECURITY: Rooms are NOT blindly rejoined. Each stored room is
   * re-validated via BoardAccessService — the user could have been
   * removed from the project while disconnected.
   *
   * GRACEFUL DEGRADATION: If Redis is down, returns silently
   * (no rooms restored, user must rejoin manually).
   */
  private async restoreRooms(client: AuthenticatedSocket): Promise<void> {
    const userId = client.data.user.id;

    try {
      const storedRooms = await this.wsSessionStore.getRooms(userId);

      if (storedRooms.length === 0) {
        return; // No previous rooms to restore
      }

      const restoredRooms: string[] = [];

      for (const roomName of storedRooms) {
        // Extract boardId from room name (format: "board:uuid")
        const boardId = roomName.replace('board:', '');

        // Re-validate access — user may have lost permissions
        const access = await this.boardAccessService.validateAccess(
          userId,
          boardId,
        );

        if (access.granted) {
          await client.join(roomName);
          restoredRooms.push(roomName);
        } else {
          // User lost access — remove stale room from store
          await this.wsSessionStore.untrackRoom(userId, roomName);
          this.logger.debug(
            `Stale room removed during restore: ${roomName} (user: ${userId})`,
          );
        }
      }

      if (restoredRooms.length > 0) {
        // Notify client which rooms were auto-restored
        client.emit('rooms:restored', {
          rooms: restoredRooms,
          count: restoredRooms.length,
          timestamp: new Date().toISOString(),
        });

        this.logger.log(
          `Restored ${restoredRooms.length}/${storedRooms.length} rooms ` +
            `for user ${userId} (socket: ${client.id})`,
        );
      }
    } catch (err: unknown) {
      // Graceful degradation — don't block connection on restore failure
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Room restore failed for user ${userId}: ${message}`);
    }
  }

  /**
   * Extract JWT token from handshake.
   * Priority: auth.token > headers.authorization
   * Sanitizes "Bearer " prefix from authorization header.
   */
  private extractToken(client: Socket): string | undefined {
    // Primary: Check handshake auth object (standard socket.io pattern)
    const authToken = client.handshake.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken;
    }

    // Fallback: Check Authorization header with Bearer prefix
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      // Robust handling: trim and case-insensitive prefix check
      const trimmed = authHeader.trim();
      if (trimmed.toLowerCase().startsWith('bearer ')) {
        return trimmed.slice(7).trim();
      }
      // If no Bearer prefix, assume raw token
      return trimmed;
    }

    return undefined;
  }

  /**
   * Categorize JWT error for structured logging.
   * SECURITY: Never includes the actual token in error messages.
   */
  private categorizeJwtError(err: unknown): string {
    if (!(err instanceof Error)) {
      return 'UnknownError';
    }

    const message = err.message.toLowerCase();

    if (message.includes('expired')) {
      return 'TokenExpired';
    }
    if (
      message.includes('invalid signature') ||
      message.includes('signature')
    ) {
      return 'InvalidSignature';
    }
    if (message.includes('malformed') || message.includes('jwt malformed')) {
      return 'MalformedToken';
    }
    if (message.includes('invalid token')) {
      return 'InvalidToken';
    }

    return 'JwtVerificationFailed';
  }

  // ============================================================
  // MESSAGE HANDLERS - Protected by handshake authentication
  // ============================================================

  /**
   * Join a board room with strict authorization check.
   *
   * Security:
   * - Delegates to BoardAccessService for SRP-compliant authorization
   * - Anti-enumeration: same generic error for "not found" and "no access"
   * - WsExceptionFilter emits structured error to client on denial
   * - WARNING-level security audit log for intrusion detection
   */
  @SubscribeMessage('joinBoard')
  async handleJoinBoard(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinBoardDto,
  ): Promise<{ event: string; room: string }> {
    const { boardId } = data;
    const userId = client.data.user.id;

    // Delegate authorization to service layer (arch-single-responsibility)
    const access = await this.boardAccessService.validateAccess(
      userId,
      boardId,
    );

    if (!access.granted) {
      // SECURITY: Generic message prevents board ID enumeration
      // Specific reason is logged by BoardAccessService at WARNING level
      this.logger.warn(
        `[SECURITY] Unauthorized WS access attempt: ` +
          `User ${userId} → Board ${boardId} (socket: ${client.id})`,
      );
      throw new WsException('Access denied to this board');
    }

    // User is authorized — join the room
    const roomName = `board:${boardId}`;
    await client.join(roomName);

    // Track room subscription in Redis for reconnection recovery
    await this.wsSessionStore.trackRoom(userId, roomName);

    this.logger.log(
      `User ${userId} joined room: ${roomName} (role: ${access.role})`,
    );

    return { event: 'joined', room: roomName };
  }

  /**
   * Leave a board room.
   * No authorization check needed - user can always leave a room they're in.
   */
  @SubscribeMessage('leaveBoard')
  async handleLeaveBoard(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: LeaveBoardDto,
  ): Promise<{ event: string; room: string }> {
    const { boardId } = data;
    const roomName = `board:${boardId}`;
    const userId = client.data.user.id;

    await client.leave(roomName);

    // Remove room from session store
    await this.wsSessionStore.untrackRoom(userId, roomName);

    this.logger.log(`Client ${client.id} left room: ${roomName}`);

    return { event: 'left', room: roomName };
  }

  // ============================================================
  // AUTH LIFECYCLE — Token refresh without reconnection
  // ============================================================

  /**
   * Refresh JWT token over an active WebSocket connection.
   *
   * Enables seamless token rotation without forcing a reconnect.
   * The handler validates the new JWT, asserts identity continuity
   * (anti-hijacking), and atomically updates the socket's state.
   *
   * SECURITY:
   * - @SkipWsAuth: Bypasses per-message guard (token may be expired)
   * - Anti-hijacking: newPayload.sub MUST match client.data.user.id
   * - Sub mismatch = immediate disconnect (potential session hijacking)
   * - Atomic mutation: single-threaded Node.js guarantees no race conditions
   */
  @SkipWsAuth()
  @SubscribeMessage('auth:refresh')
  async handleTokenRefresh(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsTokenRefreshDto,
  ): Promise<void> {
    const currentUserId = client.data.user.id;

    try {
      // Step 1: Verify the new JWT
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        this.logger.error(
          `[AUTH] Token refresh failed [${client.id}]: JWT_SECRET not configured`,
        );
        client.emit('auth:refresh:error', {
          status: 'error',
          message: 'Server configuration error',
          timestamp: new Date().toISOString(),
        });
        client.disconnect(true);
        return;
      }

      const newPayload = await this.jwtService.verifyAsync<JwtPayload>(
        data.token,
        { secret },
      );

      // Step 2: Validate payload structure
      if (!newPayload.sub || !newPayload.email) {
        this.logger.warn(
          `[AUTH] Token refresh rejected [${client.id}]: InvalidPayloadStructure`,
        );
        client.emit('auth:refresh:error', {
          status: 'error',
          message: 'Invalid token payload',
          timestamp: new Date().toISOString(),
        });
        client.disconnect(true);
        return;
      }

      // Step 3: ANTI-HIJACKING — Assert identity continuity
      // If the new token belongs to a different user, this is a
      // session hijacking attempt. Disconnect IMMEDIATELY.
      if (newPayload.sub !== currentUserId) {
        this.logger.warn(
          `[SECURITY] Session hijacking attempt detected! ` +
            `Socket ${client.id}: current user=${currentUserId}, ` +
            `new token user=${newPayload.sub}. Disconnecting.`,
        );
        client.emit('auth:refresh:error', {
          status: 'error',
          message: 'Identity mismatch — connection terminated',
          timestamp: new Date().toISOString(),
        });
        client.disconnect(true);
        return;
      }

      // Step 4: Atomic state mutation
      // Node.js is single-threaded — this assignment cannot be
      // interleaved with other event handlers mid-execution.
      client.data.user = {
        id: newPayload.sub,
        email: newPayload.email,
        roles: newPayload.roles || [],
      };

      // Step 5: Update handshake token for guard compatibility
      // If WsJwtGuard is applied in the future, it reads from
      // client.handshake.auth.token — keep it current.
      client.handshake.auth = {
        ...client.handshake.auth,
        token: data.token,
      };

      // Step 6: Acknowledgment handshake
      const expiresAt = newPayload.exp
        ? new Date(newPayload.exp * 1000).toISOString()
        : undefined;

      client.emit('auth:refresh:success', {
        status: 'ok',
        expiresAt,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `[AUTH] Token refreshed for user ${currentUserId} (socket: ${client.id})`,
      );
    } catch (err: unknown) {
      // JWT verification failed (expired, malformed, invalid signature)
      const errorType = this.categorizeJwtError(err);

      this.logger.warn(
        `[AUTH] Token refresh failed [${client.id}]: ${errorType} (user: ${currentUserId})`,
      );

      client.emit('auth:refresh:error', {
        status: 'error',
        message: 'Token verification failed',
        timestamp: new Date().toISOString(),
      });

      // Invalid token on refresh = disconnect
      client.disconnect(true);
    }
  }

  // ============================================================
  // EMIT METHODS - Called by services to broadcast changes
  // These enable "delta updates" instead of full refetch
  // ============================================================

  /**
   * Emit issue moved event to all clients in the board room
   * Clients update their React Query cache directly (no refetch)
   */
  emitIssueMoved(boardId: string, payload: IssueMovedPayload): void {
    const roomName = `board:${boardId}`;
    this.server.to(roomName).emit('issue-moved', payload);
    this.logger.debug(`Emitted issue-moved to ${roomName}: ${payload.issueId}`);
  }

  /**
   * Emit issue created event
   */
  emitIssueCreated(boardId: string, payload: IssueCreatedPayload): void {
    const roomName = `board:${boardId}`;
    this.server.to(roomName).emit('issue-created', payload);
    this.logger.debug(
      `Emitted issue-created to ${roomName}: ${payload.issue.id}`,
    );
  }

  /**
   * Emit issue updated event (title, description, priority, etc.)
   */
  emitIssueUpdated(boardId: string, payload: IssueUpdatedPayload): void {
    const roomName = `board:${boardId}`;
    this.server.to(roomName).emit('issue-updated', payload);
    this.logger.debug(
      `Emitted issue-updated to ${roomName}: ${payload.issueId}`,
    );
  }

  /**
   * Emit issue deleted event
   */
  emitIssueDeleted(boardId: string, payload: IssueDeletedPayload): void {
    const roomName = `board:${boardId}`;
    this.server.to(roomName).emit('issue-deleted', payload);
    this.logger.debug(
      `Emitted issue-deleted to ${roomName}: ${payload.issueId}`,
    );
  }

  /**
   * Emit issue reordered event within a column
   * Clients update their local ordering without refetch.
   */
  emitIssueReordered(boardId: string, payload: IssueReorderedPayload): void {
    const roomName = `board:${boardId}`;
    this.server.to(roomName).emit('issue-reordered', payload);
    this.logger.debug(
      `Emitted issue-reordered to ${roomName}: column=${payload.columnId}`,
    );
  }

  /**
   * Emit columns reordered event on a board
   * Clients update their column ordering without refetch.
   */
  emitColumnsReordered(
    boardId: string,
    payload: ColumnsReorderedPayload,
  ): void {
    const roomName = `board:${boardId}`;
    this.server.to(roomName).emit('columns-reordered', payload);
    this.logger.debug(
      `Emitted columns-reordered to ${roomName}: ${payload.orderedColumnIds.length} columns`,
    );
  }
}

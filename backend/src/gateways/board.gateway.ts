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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Board } from '../boards/entities/board.entity';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import {
  IssueMovedPayload,
  IssueCreatedPayload,
  IssueUpdatedPayload,
  IssueDeletedPayload,
} from './dto/board-events.dto';
import { JoinBoardDto, LeaveBoardDto } from './dto/join-board.dto';

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
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];

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
    @InjectRepository(Board)
    private readonly boardRepo: Repository<Board>,
    private readonly projectMembersService: ProjectMembersService,
  ) { }

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
        this.logger.error(`Connection rejected [${clientId}]: JwtSecretNotConfigured`);
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });

      // 3. Validate payload structure
      if (!payload.sub || !payload.email) {
        this.logger.warn(`Connection rejected [${clientId}]: InvalidPayloadStructure`);
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

      this.logger.log(`Client authenticated [${clientId}]: user=${payload.sub}`);
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
    if (message.includes('invalid signature') || message.includes('signature')) {
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
   * Join a board room with authorization check.
   * 
   * Security: Validates user is a member of the project that owns the board.
   * Uses generic error message to prevent ID enumeration attacks.
   */
  @SubscribeMessage('joinBoard')
  async handleJoinBoard(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinBoardDto,
  ): Promise<{ event: string; room: string }> {
    const { boardId } = data;
    const userId = client.data.user.id;

    // Step 1: Retrieve board to get projectId (lightweight query)
    const board = await this.boardRepo.findOne({
      where: { id: boardId },
      select: ['id', 'projectId'],
    });

    // Step 2: Check if board exists AND user has access
    // SECURITY: Same error for "not found" and "no access" to prevent ID enumeration
    if (!board) {
      this.logger.warn(`Access denied [${client.id}]: Board not found or no access`);
      throw new WsException('Access denied to this board');
    }

    // Step 3: Check user membership in the project
    const role = await this.projectMembersService.getUserRole(board.projectId, userId);

    if (!role) {
      this.logger.warn(`Access denied [${client.id}]: User ${userId} not a member of project ${board.projectId}`);
      throw new WsException('Access denied to this board');
    }

    // Step 4: User is authorized - join the room
    const roomName = `board:${boardId}`;
    await client.join(roomName);
    this.logger.log(`User ${userId} joined room: ${roomName} (role: ${role})`);

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
}

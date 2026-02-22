import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { SKIP_WS_AUTH_KEY } from '../decorators/skip-ws-auth.decorator';

/**
 * WebSocket JWT Guard
 *
 * Per-message authentication guard for WebSocket handlers.
 * Extracts and verifies the JWT from the handshake context on every message.
 *
 * Supports @SkipWsAuth() decorator to bypass validation for specific
 * handlers that perform their own authentication (e.g., auth:refresh).
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'ws') {
      return true;
    }

    // Check for @SkipWsAuth() decorator on the handler
    const skipAuth = this.reflector.getAllAndOverride<boolean>(
      SKIP_WS_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipAuth) {
      return true;
    }

    const client = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn('WS message rejected: No token provided');
      return false;
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET');

      const payload = this.jwtService.verify(token, { secret });

      // Attach user to client object
      client.data.user = payload;
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`WS message rejected: Invalid token - ${message}`);
      return false;
    }
  }

  private extractToken(client: Socket): string | undefined {
    // 1. Check handshake auth object (standard socket.io)
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token as string;
    }

    // 2. Check query params (common fallback)
    const queryToken = client.handshake.query.token as string;
    if (queryToken) {
      return queryToken;
    }

    // 3. Check Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
      return authHeader.split(' ')[1];
    }

    return undefined;
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'ws') {
      return true;
    }

    const client = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn('WS Connection rejected: No token provided');
      return false;
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const payload = this.jwtService.verify(token, { secret });

      // Attach user to client object
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      client.data.user = payload;
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`WS Connection rejected: Invalid token - ${message}`);
      return false;
    }
  }

  private extractToken(client: Socket): string | undefined {
    // 1. Check handshake auth object (standard socket.io)

    if (client.handshake.auth?.token) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return client.handshake.auth.token;
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

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  SESSION_COMMAND_TOKEN,
  SESSION_LIFECYCLE_TOKEN,
  SESSION_QUERY_TOKEN,
} from '../constants/session.tokens';
import {
  ISessionCommand,
  ISessionLifecycle,
  ISessionQuery,
} from '../interfaces/session.interfaces';
import { SessionStatus, Session } from '../entities/session.entity';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

interface SessionRequest extends Omit<Request, 'session' | 'sessionID'> {
  session?: Session;
  sessionId?: string;
  sessionID?: string;
  cookies: { sessionId?: string };
}

/**
 * Session Interceptor
 *
 * Validates and manages user sessions for protected routes.
 *
 * PUBLIC ROUTE DECLARATION:
 * Use the @Public() decorator to skip session validation for specific endpoints.
 *
 * Example:
 *   @Public()
 *   @Get('health')
 *   healthCheck() { return { status: 'ok' }; }
 *
 * ARCHITECTURE:
 * - Uses NestJS Reflector to read @Public() metadata
 * - Checks both handler (method) and class level decorators
 * - Follows Open/Closed Principle - no hardcoded route lists
 */
@Injectable()
export class SessionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SessionInterceptor.name);

  constructor(
    @Inject(SESSION_QUERY_TOKEN) private readonly query: ISessionQuery,
    @Inject(SESSION_LIFECYCLE_TOKEN)
    private readonly lifecycle: ISessionLifecycle,
    @Inject(SESSION_COMMAND_TOKEN) private readonly command: ISessionCommand,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<SessionRequest>();

    // =========================================================================
    // PUBLIC ROUTE CHECK (Declarative via @Public() decorator)
    // =========================================================================
    // Checks both handler-level and class-level decorators
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // Check method decorator first
      context.getClass(), // Then check class decorator
    ]);

    if (isPublic) {
      this.logger.debug(
        `Skipping session check: Public route [${request.url}]`,
      );
      return next.handle();
    }

    // Get session ID from request
    const sessionId = this.extractSessionId(request);

    if (!sessionId) {
      throw new UnauthorizedException('Session ID required');
    }

    // Validate session
    const session = await this.query.getSession(sessionId);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new UnauthorizedException('Session is not active');
    }

    if (session.isLocked) {
      throw new UnauthorizedException(
        'Session is locked due to suspicious activity',
      );
    }

    // Check if session is expired
    if (new Date() > session.expiresAt) {
      await this.lifecycle.terminateSession(
        sessionId,
        'system',
        'Session expired',
      );
      throw new UnauthorizedException('Session has expired');
    }

    // Update session activity
    await this.command.updateSessionActivity(sessionId, request.ip);

    // Add session info to request
    request.session = session;
    request.sessionId = sessionId;

    return next.handle().pipe(
      tap(() => {
        this.logger.debug(`Session activity updated: ${sessionId}`);
      }),
    );
  }

  private extractSessionId(request: SessionRequest): string | null {
    // Try to get session ID from various sources
    return (
      request.sessionID ||
      (Array.isArray(request.headers['x-session-id'])
        ? request.headers['x-session-id'][0]
        : request.headers['x-session-id']) ||
      request.cookies?.sessionId ||
      (request.query.sessionId as string) ||
      null
    );
  }
}

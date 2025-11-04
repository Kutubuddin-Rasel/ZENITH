import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SessionService } from '../session.service';
import { SessionStatus } from '../entities/session.entity';

@Injectable()
export class SessionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SessionInterceptor.name);

  constructor(private sessionService: SessionService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Skip session validation for public routes
    if (this.isPublicRoute(request.url)) {
      return next.handle();
    }

    // Get session ID from request
    const sessionId = this.extractSessionId(request);

    if (!sessionId) {
      throw new UnauthorizedException('Session ID required');
    }

    // Validate session
    const session = await this.sessionService.getSession(sessionId);

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
      await this.sessionService.terminateSession(
        sessionId,
        'system',
        'Session expired',
      );
      throw new UnauthorizedException('Session has expired');
    }

    // Update session activity
    await this.sessionService.updateSessionActivity(sessionId, request.ip);

    // Add session info to request
    request.session = session;
    request.sessionId = sessionId;

    return next.handle().pipe(
      tap(() => {
        this.logger.debug(`Session activity updated: ${sessionId}`);
      }),
    );
  }

  private extractSessionId(request: any): string | null {
    // Try to get session ID from various sources
    return (
      request.sessionID ||
      request.headers['x-session-id'] ||
      request.cookies?.sessionId ||
      request.query.sessionId ||
      null
    );
  }

  private isPublicRoute(url: string): boolean {
    const publicRoutes = [
      '/auth/login',
      '/auth/register',
      '/auth/saml',
      '/health',
      '/metrics',
    ];

    return publicRoutes.some((route) => url.startsWith(route));
  }
}

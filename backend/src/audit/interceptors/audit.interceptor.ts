import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Request } from 'express';
import { AuditService, AuditLogData } from '../services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
  AuditStatus,
} from '../entities/audit-log.entity';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<{
      setHeader: (name: string, value: string) => void;
      get: (name: string) => string;
    }>();
    const handler = context.getHandler();
    const className = context.getClass().name;

    const startTime = Date.now();
    const requestId = this.generateRequestId();
    const user = (
      request as unknown as {
        user?: { userId: string; email: string; name: string };
      }
    ).user;

    // Add request ID to response headers
    response.setHeader('X-Request-ID', requestId);

    return next.handle().pipe(
      switchMap(async (data) => {
        const duration = Date.now() - startTime;
        await this.logSuccessEvent(
          request,
          response,
          handler,
          className,
          data,
          duration,
          requestId,
          user,
        );
        return data as unknown;
      }),
      catchError(async (error) => {
        const duration = Date.now() - startTime;
        await this.logErrorEvent(
          request,
          response,
          handler,
          className,
          error,
          duration,
          requestId,
          user,
        );
        throw error;
      }),
    );
  }

  private async logSuccessEvent(
    request: Request,
    response: any,
    handler: any,
    className: string,
    data: any,
    duration: number,
    requestId: string,
    user: any,
  ): Promise<void> {
    try {
      const eventType = this.determineEventType(
        request.method,
        request.url,
        className,
        (handler as Record<string, unknown>).name as string,
      );

      if (eventType) {
        const auditData: AuditLogData = {
          eventType,
          severity: this.determineSeverity(
            eventType,
            (response as Record<string, unknown>).statusCode as number,
          ),
          status: this.determineStatus(
            (response as Record<string, unknown>).statusCode as number,
          ),
          description: this.generateDescription(
            request.method,
            request.url,
            className,
            (handler as Record<string, unknown>).name as string,
          ),
          details: {
            method: request.method,
            url: request.url,
            statusCode: (response as Record<string, unknown>)
              .statusCode as number,
            duration,
            className,
            handlerName: (handler as Record<string, unknown>).name as string,
            userAgent: request.get('User-Agent'),
            referer: request.get('Referer'),
            contentLength: (response as { get: (name: string) => string }).get(
              'Content-Length',
            ),
          },
          userId: (user as { userId: string; email: string; name: string })
            ?.userId,
          userEmail: (user as { userId: string; email: string; name: string })
            ?.email,
          userName: (user as { userId: string; email: string; name: string })
            ?.name,
          ipAddress: this.getClientIp(request),
          userAgent: request.get('User-Agent'),
          sessionId:
            ((request as unknown as Record<string, unknown>)
              .sessionID as string) || undefined,
          requestId,
          metadata: {
            route: `${className}.${(handler as Record<string, unknown>).name as string}`,
            timestamp: new Date().toISOString(),
            duration,
          },
        };

        await this.auditService.log(auditData);
      }
    } catch (error) {
      this.logger.error('Failed to log audit event', String(error));
    }
  }

  private async logErrorEvent(
    request: Request,
    response: any,
    handler: any,
    className: string,
    error: any,
    duration: number,
    requestId: string,
    user: { userId: string; email: string; name: string } | undefined,
  ): Promise<void> {
    try {
      const eventType = this.determineErrorEventType(
        request.method,
        request.url,
        className,
        (handler as Record<string, unknown>).name as string,
        error,
      );

      if (eventType) {
        const auditData: AuditLogData = {
          eventType,
          severity: AuditSeverity.HIGH,
          status: AuditStatus.FAILURE,
          description: this.generateErrorDescription(
            request.method,
            request.url,
            className,
            (handler as Record<string, unknown>).name as string,
            error,
          ),
          details: {
            method: request.method,
            url: request.url,
            error: (error as Error).message,
            stack: (error as Error).stack,
            duration,
            className,
            handlerName: (handler as Record<string, unknown>).name as string,
            userAgent: request.get('User-Agent'),
            referer: request.get('Referer'),
          },
          userId: (user as { userId: string; email: string; name: string })
            ?.userId,
          userEmail: (user as { userId: string; email: string; name: string })
            ?.email,
          userName: (user as { userId: string; email: string; name: string })
            ?.name,
          ipAddress: this.getClientIp(request),
          userAgent: request.get('User-Agent'),
          sessionId:
            ((request as unknown as Record<string, unknown>)
              .sessionID as string) || undefined,
          requestId,
          metadata: {
            route: `${className}.${(handler as Record<string, unknown>).name as string}`,
            timestamp: new Date().toISOString(),
            duration,
            errorType: (error as Error).constructor.name,
          },
        };

        await this.auditService.log(auditData);
      }
    } catch (auditError) {
      this.logger.error('Failed to log audit error event', auditError);
    }
  }

  private determineEventType(
    method: string,
    url: string,
    className: string,
    handlerName: string,
  ): AuditEventType | null {
    // Authentication events
    if (className === 'AuthController') {
      switch (handlerName) {
        case 'login':
          return AuditEventType.LOGIN_SUCCESS;
        case 'register':
          return AuditEventType.USER_CREATED;
        case 'redeemInvite':
          return AuditEventType.USER_CREATED;
        default:
          return null;
      }
    }

    // User management events
    if (className === 'UsersController') {
      switch (handlerName) {
        case 'create':
          return AuditEventType.USER_CREATED;
        case 'update':
          return AuditEventType.USER_UPDATED;
        case 'remove':
          return AuditEventType.USER_DELETED;
        default:
          return null;
      }
    }

    // Project management events
    if (className === 'ProjectsController') {
      switch (handlerName) {
        case 'create':
          return AuditEventType.PROJECT_CREATED;
        case 'update':
          return AuditEventType.PROJECT_UPDATED;
        case 'remove':
          return AuditEventType.PROJECT_DELETED;
        default:
          return null;
      }
    }

    // Issue management events
    if (className === 'IssuesController') {
      switch (handlerName) {
        case 'create':
          return AuditEventType.ISSUE_CREATED;
        case 'update':
          return AuditEventType.ISSUE_UPDATED;
        case 'remove':
          return AuditEventType.ISSUE_DELETED;
        case 'assign':
          return AuditEventType.ISSUE_ASSIGNED;
        case 'unassign':
          return AuditEventType.ISSUE_UNASSIGNED;
        default:
          return null;
      }
    }

    // Sprint management events
    if (className === 'SprintsController') {
      switch (handlerName) {
        case 'create':
          return AuditEventType.SPRINT_CREATED;
        case 'update':
          return AuditEventType.SPRINT_UPDATED;
        case 'remove':
          return AuditEventType.SPRINT_DELETED;
        case 'startSprint':
          return AuditEventType.SPRINT_STARTED;
        case 'completeSprint':
          return AuditEventType.SPRINT_COMPLETED;
        default:
          return null;
      }
    }

    // File management events
    if (className === 'AttachmentsController') {
      switch (handlerName) {
        case 'upload':
          return AuditEventType.FILE_UPLOADED;
        case 'download':
          return AuditEventType.FILE_DOWNLOADED;
        case 'remove':
          return AuditEventType.FILE_DELETED;
        default:
          return null;
      }
    }

    // Configuration events
    if (
      className === 'SAMLController' ||
      className === 'TwoFactorAuthController'
    ) {
      return AuditEventType.CONFIGURATION_CHANGED;
    }

    return null;
  }

  private determineErrorEventType(
    method: string,
    url: string,
    className: string,
    handlerName: string,
    error: { status?: number; message?: string },
  ): AuditEventType | null {
    // Authentication errors
    if (className === 'AuthController' && handlerName === 'login') {
      return AuditEventType.LOGIN_FAILED;
    }

    // Unauthorized access
    if (error.status === 401 || error.status === 403) {
      return AuditEventType.UNAUTHORIZED_ACCESS;
    }

    // Suspicious activity
    if (
      error.status === 429 ||
      (error.message as string)?.includes('rate limit')
    ) {
      return AuditEventType.SUSPICIOUS_ACTIVITY;
    }

    return null;
  }

  private determineSeverity(
    eventType: AuditEventType,
    statusCode: number,
  ): AuditSeverity {
    if (statusCode >= 500) {
      return AuditSeverity.HIGH;
    }
    if (statusCode >= 400) {
      return AuditSeverity.MEDIUM;
    }

    switch (eventType) {
      case AuditEventType.USER_DELETED:
      case AuditEventType.PROJECT_DELETED:
      case AuditEventType.UNAUTHORIZED_ACCESS:
        return AuditSeverity.HIGH;
      case AuditEventType.USER_CREATED:
      case AuditEventType.PROJECT_CREATED:
      case AuditEventType.LOGIN_FAILED:
        return AuditSeverity.MEDIUM;
      default:
        return AuditSeverity.LOW;
    }
  }

  private determineStatus(statusCode: number): AuditStatus {
    if (statusCode >= 200 && statusCode < 300) {
      return AuditStatus.SUCCESS;
    }
    if (statusCode >= 400 && statusCode < 500) {
      return AuditStatus.WARNING;
    }
    if (statusCode >= 500) {
      return AuditStatus.FAILURE;
    }
    return AuditStatus.INFO;
  }

  private generateDescription(
    method: string,
    url: string,
    className: string,
    handlerName: string,
  ): string {
    return `${method} ${url} - ${className}.${handlerName}`;
  }

  private generateErrorDescription(
    method: string,
    url: string,
    className: string,
    handlerName: string,
    error: { message?: string },
  ): string {
    return `${method} ${url} - ${className}.${handlerName} failed: ${error.message || 'Unknown error'}`;
  }

  private getClientIp(request: Request): string {
    return (request.ip ||
      (request as any).connection?.remoteAddress ||
      (request as any).socket?.remoteAddress ||
      (request as any).connection?.socket?.remoteAddress ||
      'unknown') as string;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

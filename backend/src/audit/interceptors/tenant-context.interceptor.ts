import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

// =============================================================================
// ATTACK DETECTION TYPES
// =============================================================================

/** Fields that a confused deputy attack might try to inject */
const TENANT_FIELDS_TO_STRIP = ['organizationId', 'orgId', 'tenantId'] as const;

// =============================================================================
// TENANT CONTEXT INTERCEPTOR
// =============================================================================

/**
 * Defense-in-Depth: Tenant Context Interceptor
 *
 * PURPOSE:
 * Prevents "Confused Deputy" attacks where an authenticated user with valid
 * permissions attempts to pass a foreign `organizationId` in query params
 * or request body to access another tenant's data.
 *
 * HOW IT WORKS:
 * 1. Strips `organizationId`, `orgId`, `tenantId` from `req.query` and `req.body`
 * 2. Logs a WARN-level alert if any user-supplied tenant fields are detected
 * 3. Runs BEFORE the handler executes (interceptor `before` phase)
 *
 * The controller's `extractOrganizationId()` method already reads exclusively
 * from `req.user.organizationId` (JWT). This interceptor is a second layer
 * ensuring no future developer accidentally uses a user-supplied value.
 *
 * @see AuditController.extractOrganizationId()
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    this.stripTenantFields(request);
    return next.handle();
  }

  /**
   * Strip all tenant-related fields from query and body.
   * Log a security warning if any were present (tampering indicator).
   */
  private stripTenantFields(request: Request): void {
    const tamperLog: string[] = [];

    // Strip from query parameters
    const query = request.query as Record<string, unknown>;
    for (const field of TENANT_FIELDS_TO_STRIP) {
      if (field in query) {
        tamperLog.push(`query.${field}="${String(query[field])}"`);
        delete query[field];
      }
    }

    // Strip from request body
    const body = request.body as Record<string, unknown> | undefined;
    if (body && typeof body === 'object') {
      for (const field of TENANT_FIELDS_TO_STRIP) {
        if (field in body) {
          tamperLog.push(`body.${field}="${String(body[field])}"`);
          delete body[field];
        }
      }
    }

    // Alert on tampering
    if (tamperLog.length > 0) {
      const userId = this.extractUserIdSafely(request);
      const ip = request.ip || request.socket?.remoteAddress || 'unknown';

      this.logger.warn(
        `TENANT TAMPERING DETECTED: User=${userId} IP=${ip} ` +
          `Method=${request.method} Path=${request.path} ` +
          `Stripped=[${tamperLog.join(', ')}]`,
      );
    }
  }

  private extractUserIdSafely(request: Request): string {
    interface RequestWithUser extends Request {
      user?: { userId?: string; id?: string; sub?: string };
    }
    const typed = request as RequestWithUser;
    return typed.user?.userId || typed.user?.id || typed.user?.sub || 'anonymous';
  }
}

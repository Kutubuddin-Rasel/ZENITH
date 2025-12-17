/**
 * TenantMiddleware - Extracts tenant context from JWT
 *
 * This middleware runs on every request and:
 * 1. Extracts the user from the request (set by JWT auth)
 * 2. Reads the organizationId from the user
 * 3. Stores it in TenantContext for use throughout the request
 *
 * This is an interceptor (not middleware) because we need
 * access to the parsed JWT user which is set after auth guards run.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContext } from './tenant-context.service';

export interface RequestWithUser {
  user?: {
    id: string;
    email: string;
    organizationId?: string;
    isSuperAdmin?: boolean;
  };
}

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(private readonly tenantContext: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (user?.organizationId) {
      // Set tenant context from JWT
      this.tenantContext.setTenantId(user.organizationId);
      this.logger.debug(
        `Tenant context set: ${user.organizationId} for user ${user.id}`,
      );
    } else if (user?.isSuperAdmin) {
      // Super admins may operate without a specific tenant
      // They can use @BypassTenantScope if needed
      this.logger.debug(
        `Super admin request without tenant context: ${user.id}`,
      );
    }

    return next.handle();
  }
}

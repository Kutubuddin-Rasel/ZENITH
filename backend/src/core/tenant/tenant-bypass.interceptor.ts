/**
 * TenantBypassInterceptor (Phase 2 - Tenant Remediation)
 *
 * This interceptor wires the @BypassTenantScope decorator to actually
 * enable/disable tenant bypass via TenantContext.
 *
 * ARCHITECTURE CHOICE: Interceptor over Guard
 * - Guards only run BEFORE handler (can't cleanup after)
 * - Interceptors wrap the entire lifecycle with RxJS finalize()
 * - Enables proper setup/teardown: enable -> handle -> disable
 *
 * SECURITY:
 * - Extracts userId from request.user (requires AuthGuard to run first)
 * - Uses reason from decorator or auto-generates from context
 * - Explicit cleanup ensures bypass doesn't leak to other operations
 *
 * LIFECYCLE:
 * 1. Check for @BypassTenantScope metadata (class or method level)
 * 2. If found: enableBypass(reason, userId)
 * 3. Execute handler
 * 4. finalize(): disableBypass(reason, userId)
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Request } from 'express';
import { TenantContext } from './tenant-context.service';
import {
  BYPASS_TENANT_SCOPE_KEY,
  BypassTenantScopeMetadata,
} from './bypass-tenant-scope.decorator';

/**
 * Type-safe user interface for request.user
 * Minimal interface - only what we need for bypass
 */
interface RequestUser {
  id: string;
  email?: string;
}

/**
 * Extended Request with typed user property
 */
interface RequestWithUser extends Request {
  user?: RequestUser;
}

/**
 * System user ID for unauthenticated/public bypass scenarios
 * Format follows system:context pattern from Phase 1
 */
const SYSTEM_USER_PUBLIC = 'system:public-bypass' as const;

@Injectable()
export class TenantBypassInterceptor implements NestInterceptor<
  unknown,
  unknown
> {
  private readonly logger = new Logger(TenantBypassInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only process HTTP requests
    if (context.getType() !== 'http') {
      return next.handle();
    }

    // Check for bypass metadata (method-level takes precedence over class-level)
    const metadata = this.getBypassMetadata(context);

    // No bypass decorator - proceed normally
    if (!metadata) {
      return next.handle();
    }

    // Extract user and reason for audit logging
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithUser>();
    const userId = this.extractUserId(request);
    const reason = this.buildReason(metadata, context);

    // SETUP: Enable bypass before handler executes
    this.tenantContext.enableBypass(reason, userId);
    this.logger.debug(
      `Bypass enabled for ${context.getClass().name}.${context.getHandler().name}`,
    );

    // TEARDOWN: Disable bypass after handler completes (or errors)
    return next.handle().pipe(
      finalize(() => {
        this.tenantContext.disableBypass(reason, userId);
        this.logger.debug(
          `Bypass disabled for ${context.getClass().name}.${context.getHandler().name}`,
        );
      }),
    );
  }

  /**
   * Get bypass metadata from method or class
   *
   * Precedence: Method > Class
   * This allows class-level bypass with method-level overrides
   */
  private getBypassMetadata(
    context: ExecutionContext,
  ): BypassTenantScopeMetadata | undefined {
    // Try method-level first
    const methodMetadata = this.reflector.get<BypassTenantScopeMetadata>(
      BYPASS_TENANT_SCOPE_KEY,
      context.getHandler(),
    );

    if (methodMetadata?.enabled) {
      return methodMetadata;
    }

    // Fall back to class-level
    const classMetadata = this.reflector.get<BypassTenantScopeMetadata>(
      BYPASS_TENANT_SCOPE_KEY,
      context.getClass(),
    );

    if (classMetadata?.enabled) {
      return classMetadata;
    }

    return undefined;
  }

  /**
   * Extract user ID from request
   *
   * FALLBACK STRATEGY:
   * - If request.user exists (authenticated): use user.id
   * - If request.user is undefined (public endpoint): use system identifier
   *
   * This allows @BypassTenantScope on public endpoints while maintaining
   * audit trail with system:public-bypass actor.
   */
  private extractUserId(request: RequestWithUser): string {
    if (request.user?.id) {
      return request.user.id;
    }

    // Fallback for unauthenticated requests
    this.logger.debug(
      'No user in request, using system identifier for bypass audit',
    );
    return SYSTEM_USER_PUBLIC;
  }

  /**
   * Build reason string for audit logging
   *
   * PRIORITY:
   * 1. Reason from decorator argument
   * 2. Auto-generated from controller/method context
   */
  private buildReason(
    metadata: BypassTenantScopeMetadata,
    context: ExecutionContext,
  ): string {
    // Use explicit reason if provided
    if (metadata.reason) {
      return metadata.reason;
    }

    // Auto-generate from context
    const className = context.getClass().name;
    const methodName = context.getHandler().name;
    return `@BypassTenantScope on ${className}.${methodName}`;
  }
}

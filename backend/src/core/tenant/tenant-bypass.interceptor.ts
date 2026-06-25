/**
 * TenantBypassInterceptor — wires `@BypassTenantScope` to the bypass
 * controller (Step 3 DIP cleanup).
 *
 * ARCHITECTURE: interceptor over guard so RxJS `finalize()` can
 * guarantee teardown — `enable -> handle -> disable` even on errors.
 *
 * DIP: depends on `ITenantBypassController` via the segregated
 *      token. The raw `request.user.id` access has been replaced by
 *      a generic `extractActorId` helper that derives a SOC 2-
 *      compatible actor identifier from a small, well-defined set of
 *      common JWT claim shapes — without coupling to the auth domain
 *      principal class.
 */

import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  BYPASS_TENANT_SCOPE_KEY,
  BypassTenantScopeMetadata,
} from './bypass-tenant-scope.decorator';
import { TENANT_BYPASS_CONTROLLER_TOKEN } from './constants/tenant.tokens';
import type { ITenantBypassController } from './interfaces/tenant.interfaces';

/**
 * Actor identifier used when no authenticated principal is on the
 * request (`@BypassTenantScope` on a public endpoint, scheduled jobs).
 */
const SYSTEM_USER_PUBLIC = 'system:public-bypass' as const;

/**
 * Minimal claim shape this interceptor inspects to derive the actor
 * id. Declared inline to avoid leaking the auth domain principal
 * type into the tenant module.
 */
interface PrincipalIdClaims {
  id?: string;
  userId?: string;
  sub?: string;
}

@Injectable()
export class TenantBypassInterceptor implements NestInterceptor<
  unknown,
  unknown
> {
  private readonly logger = new Logger(TenantBypassInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(TENANT_BYPASS_CONTROLLER_TOKEN)
    private readonly bypassController: ITenantBypassController,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const metadata = this.getBypassMetadata(context);
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const userId = this.extractActorId(request);
    const reason = this.buildReason(metadata, context);

    this.bypassController.enableBypass(reason, userId);
    this.logger.debug(
      `Bypass enabled for ${context.getClass().name}.${context.getHandler().name}`,
    );

    return next.handle().pipe(
      finalize(() => {
        this.bypassController.disableBypass(reason, userId);
        this.logger.debug(
          `Bypass disabled for ${context.getClass().name}.${context.getHandler().name}`,
        );
      }),
    );
  }

  private getBypassMetadata(
    context: ExecutionContext,
  ): BypassTenantScopeMetadata | undefined {
    const methodMetadata = this.reflector.get<BypassTenantScopeMetadata>(
      BYPASS_TENANT_SCOPE_KEY,
      context.getHandler(),
    );

    if (methodMetadata?.enabled) {
      return methodMetadata;
    }

    const classMetadata = this.reflector.get<BypassTenantScopeMetadata>(
      BYPASS_TENANT_SCOPE_KEY,
      context.getClass(),
    );

    return classMetadata?.enabled ? classMetadata : undefined;
  }

  /**
   * Derive the actor identifier for the SOC 2 audit trail without
   * coupling to a specific JWT principal class. Falls back to the
   * system identifier when the request is unauthenticated.
   */
  private extractActorId(request: Request): string {
    const claims = (request as Request & { user?: PrincipalIdClaims }).user;
    const candidate = claims?.id ?? claims?.userId ?? claims?.sub;

    if (candidate) {
      return candidate;
    }

    this.logger.debug(
      'No principal on request, using system identifier for bypass audit',
    );
    return SYSTEM_USER_PUBLIC;
  }

  private buildReason(
    metadata: BypassTenantScopeMetadata,
    context: ExecutionContext,
  ): string {
    if (metadata.reason) {
      return metadata.reason;
    }

    const className = context.getClass().name;
    const methodName = context.getHandler().name;
    return `@BypassTenantScope on ${className}.${methodName}`;
  }
}

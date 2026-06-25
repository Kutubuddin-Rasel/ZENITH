/**
 * TenantInterceptor — request-time tenant binding (Step 3 DIP cleanup).
 *
 * Resolves the inbound request's tenant identity through the
 * abstract `ITenantIdentityResolver` and binds it via
 * `ITenantContextWriter`. The interceptor itself no longer reads
 * `request.user.organizationId` directly — that piece of JWT
 * payload knowledge is owned by `JwtTenantIdentityResolver` (default
 * binding for `TENANT_IDENTITY_RESOLVER_TOKEN`). Swap the resolver
 * to support header-based / session-based authentication without
 * modifying this class.
 */

import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import {
  TENANT_CONTEXT_WRITER_TOKEN,
  TENANT_IDENTITY_RESOLVER_TOKEN,
} from './constants/tenant.tokens';
import type {
  ITenantContextWriter,
  ITenantIdentityResolver,
} from './interfaces/tenant.interfaces';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(
    @Inject(TENANT_IDENTITY_RESOLVER_TOKEN)
    private readonly identityResolver: ITenantIdentityResolver,
    @Inject(TENANT_CONTEXT_WRITER_TOKEN)
    private readonly contextWriter: ITenantContextWriter,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const identity = this.identityResolver.resolve(request);

    if (identity.tenantId) {
      this.contextWriter.setTenantId(identity.tenantId);
      this.logger.debug(`Tenant context set: ${identity.tenantId}`);
    } else if (identity.isPrivileged) {
      this.logger.debug('Privileged principal request without tenant context');
    }

    return next.handle();
  }
}

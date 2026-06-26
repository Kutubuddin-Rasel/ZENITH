/**
 * JwtTenantIdentityResolver
 *
 * Default adapter for {@link ITenantIdentityResolver} — extracts the
 * tenant id from a JWT-populated `request.user` payload. Encapsulates
 * the only point in the tenant module that knows the auth domain's
 * principal shape, satisfying DIP for the rest of the infrastructure.
 *
 * Replaceable: bind a different implementation against
 * {@link TENANT_IDENTITY_RESOLVER_TOKEN} (e.g. header-based for
 * service-to-service traffic, session-based for cookie auth) without
 * modifying `TenantInterceptor`.
 */

import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type {
  ITenantIdentityResolver,
  TenantIdentity,
} from '../interfaces/tenant.interfaces';

/**
 * Minimal principal contract this resolver expects on `request.user`.
 *
 * Declared inline (not exported) so other modules cannot couple to it —
 * the abstraction boundary is {@link TenantIdentity}.
 */
interface JwtPrincipal {
  id: string;
  organizationId?: string;
  isSuperAdmin?: boolean;
}

interface RequestWithJwtUser extends Request {
  user?: JwtPrincipal;
}

@Injectable()
export class JwtTenantIdentityResolver implements ITenantIdentityResolver {
  resolve(request: Request): TenantIdentity {
    const user = (request as RequestWithJwtUser).user;

    return {
      tenantId: user?.organizationId,
      isPrivileged: user?.isSuperAdmin === true,
    };
  }
}

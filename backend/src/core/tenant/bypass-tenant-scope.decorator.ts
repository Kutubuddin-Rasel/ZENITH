/**
 * BypassTenantScope Decorator
 *
 * Use this decorator on controller methods or services that need
 * to access data across tenants (e.g., super admin operations).
 *
 * WARNING: Use sparingly! Every bypass should be:
 * 1. Justified in code comments
 * 2. Reviewed by security team
 * 3. Logged for audit purposes
 *
 * Usage:
 *   @BypassTenantScope()
 *   async adminGetAllOrganizations() { ... }
 */

import { SetMetadata } from '@nestjs/common';

export const BYPASS_TENANT_SCOPE_KEY = 'bypassTenantScope';

/**
 * Decorator to mark methods that should bypass tenant filtering
 */
export const BypassTenantScope = () =>
  SetMetadata(BYPASS_TENANT_SCOPE_KEY, true);

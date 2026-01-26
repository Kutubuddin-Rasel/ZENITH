/**
 * BypassTenantScope Decorator (Phase 2 - Tenant Remediation)
 *
 * Use this decorator on controller methods or classes that need
 * to access data across tenants (e.g., super admin operations).
 *
 * SECURITY (Phase 2):
 * - Now wired to TenantBypassInterceptor which actually enables bypass
 * - Requires justification reason for audit logging (Phase 1)
 * - Audit trail created for every bypass
 *
 * WARNING: Use sparingly! Every bypass should be:
 * 1. Justified in code comments AND decorator reason
 * 2. Reviewed by security team
 * 3. Logged for audit purposes (automatic with Phase 1)
 *
 * Usage:
 *   // Method-level bypass with reason
 *   @BypassTenantScope('Admin viewing all organizations')
 *   async adminGetAllOrganizations() { ... }
 *
 *   // Class-level bypass (applies to all methods)
 *   @BypassTenantScope('Super admin controller')
 *   @Controller('super-admin')
 *   class SuperAdminController { ... }
 *
 *   // Legacy usage (auto-generates reason from context)
 *   @BypassTenantScope()
 *   async legacyMethod() { ... }
 */

import { SetMetadata } from '@nestjs/common';

export const BYPASS_TENANT_SCOPE_KEY = 'bypassTenantScope';

/**
 * Bypass metadata structure (Phase 2)
 * Contains reason for audit logging compliance
 */
export interface BypassTenantScopeMetadata {
  /** Enabled flag */
  enabled: true;
  /** Reason for bypass (optional - auto-generated if not provided) */
  reason?: string;
}

/**
 * Decorator to mark methods/classes that should bypass tenant filtering.
 *
 * WIRING (Phase 2):
 * This decorator is read by TenantBypassInterceptor which:
 * 1. Detects the metadata before handler execution
 * 2. Calls TenantContext.enableBypass(reason, userId)
 * 3. Calls TenantContext.disableBypass() after handler completes
 *
 * @param reason - Justification for bypass (shown in audit logs)
 *                 If not provided, auto-generated from controller/method name
 *
 * @example
 * @BypassTenantScope('Admin viewing all projects')
 * async getAllProjects() { ... }
 */
export const BypassTenantScope = (reason?: string) =>
  SetMetadata<string, BypassTenantScopeMetadata>(BYPASS_TENANT_SCOPE_KEY, {
    enabled: true,
    reason,
  });

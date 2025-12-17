/**
 * TenantContext - Request-scoped tenant context using CLS
 *
 * This service provides access to the current tenant (organizationId)
 * throughout the request lifecycle without passing it as a parameter.
 *
 * The tenant ID is extracted from JWT and stored in CLS by TenantMiddleware.
 */

import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

export const TENANT_ID_KEY = 'tenantId';
export const BYPASS_TENANT_KEY = 'bypassTenant';

@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}

  /**
   * Get the current tenant's organization ID
   * Returns undefined if no tenant is set (e.g., public endpoints)
   */
  getTenantId(): string | undefined {
    return this.cls.get<string>(TENANT_ID_KEY);
  }

  /**
   * Set the current tenant's organization ID
   * Called by TenantMiddleware after JWT extraction
   */
  setTenantId(organizationId: string): void {
    this.cls.set(TENANT_ID_KEY, organizationId);
  }

  /**
   * Check if tenant scope should be bypassed
   * Used for admin/system operations that need cross-tenant access
   */
  isBypassEnabled(): boolean {
    return this.cls.get<boolean>(BYPASS_TENANT_KEY) === true;
  }

  /**
   * Enable bypass for the current request
   * WARNING: Only use for legitimate admin operations
   */
  enableBypass(): void {
    this.cls.set(BYPASS_TENANT_KEY, true);
  }

  /**
   * Disable bypass (restore normal tenant filtering)
   */
  disableBypass(): void {
    this.cls.set(BYPASS_TENANT_KEY, false);
  }

  /**
   * Check if a tenant context is available
   * Returns true if organizationId is set and bypass is not enabled
   */
  hasTenantContext(): boolean {
    return !!this.getTenantId() && !this.isBypassEnabled();
  }
}

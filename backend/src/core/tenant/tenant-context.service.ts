/**
 * TenantContext - Request-scoped tenant context using CLS
 *
 * This service provides access to the current tenant (organizationId)
 * throughout the request lifecycle without passing it as a parameter.
 *
 * The tenant ID is extracted from JWT and stored in CLS by TenantMiddleware.
 *
 * SECURITY (Phase 1 - Tenant Remediation):
 * Bypass operations are now AUDITED. Every enableBypass() call requires
 * a reason and userId, logged to AuditLogsService with HIGH severity.
 * This is a compliance requirement for SOC 2.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AuditLogsService } from '../../audit/audit-logs.service';
import { v4 as uuidv4 } from 'uuid';

export const TENANT_ID_KEY = 'tenantId';
export const BYPASS_TENANT_KEY = 'bypassTenant';

/**
 * Tenant audit event constants (Phase 1 - Compliance)
 *
 * STRICT TYPING: Using const enum avoids magic strings.
 * All audit events reference these typed constants.
 */
export const TenantAuditEvents = {
  /** Tenant isolation bypass was enabled */
  BYPASS_ENABLED: 'TENANT_BYPASS_ENABLED',
  /** Tenant isolation bypass was disabled */
  BYPASS_DISABLED: 'TENANT_BYPASS_DISABLED',
} as const;

export type TenantAuditEvent =
  (typeof TenantAuditEvents)[keyof typeof TenantAuditEvents];

/**
 * Bypass context for audit logging (Phase 1)
 *
 * This interface is NOT exported to enforce usage through the service methods.
 */
interface BypassAuditContext {
  /** User ID performing the bypass (e.g., 'u-123' or 'system:scheduler') */
  userId: string;
  /** Justification for the bypass operation */
  reason: string;
  /** Optional tenant ID that is being bypassed */
  tenantId?: string;
}

@Injectable()
export class TenantContext {
  private readonly logger = new Logger(TenantContext.name);

  constructor(
    private readonly cls: ClsService,
    @Optional() private readonly auditLogsService?: AuditLogsService,
  ) {}

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
   * Enable bypass for the current request (AUDITED)
   *
   * SECURITY (Phase 1 - Tenant Remediation):
   * This method is treated like 'sudo' - a privilege escalation that MUST be
   * logged for compliance. Every caller MUST provide:
   * - reason: Why this bypass is needed
   * - userId: Who is requesting the bypass
   *
   * BREAKING CHANGE: Parameters are now REQUIRED. This forces all callers
   * to justify their bypass usage, exposing undocumented privilege escalations.
   *
   * @param reason - Justification for enabling bypass (e.g., "Admin migration script")
   * @param userId - Actor ID (e.g., "u-123" or "system:scheduler")
   *
   * @example
   * // For user-initiated bypass
   * tenantContext.enableBypass('Admin viewing all projects', req.user.id);
   *
   * // For system/scheduled job
   * tenantContext.enableBypass('Nightly cleanup job', 'system:scheduler');
   */
  enableBypass(reason: string, userId: string): void {
    const tenantId = this.getTenantId();

    // Set the bypass flag in CLS
    this.cls.set(BYPASS_TENANT_KEY, true);

    // Log the privilege escalation
    this.logger.warn(
      `🔓 Tenant bypass ENABLED by ${userId} - Reason: ${reason}`,
    );

    // Audit log (fire-and-forget with error handling)
    void this.logBypassAudit(TenantAuditEvents.BYPASS_ENABLED, {
      userId,
      reason,
      tenantId,
    });
  }

  /**
   * Disable bypass (restore normal tenant filtering) (AUDITED)
   *
   * SECURITY (Phase 1 - Tenant Remediation):
   * Also logged for complete audit trail of bypass lifecycle.
   *
   * @param reason - Justification for disabling bypass
   * @param userId - Actor ID who is disabling the bypass
   */
  disableBypass(reason: string, userId: string): void {
    const tenantId = this.getTenantId();

    // Clear the bypass flag in CLS
    this.cls.set(BYPASS_TENANT_KEY, false);

    // Log the privilege de-escalation
    this.logger.log(
      `🔒 Tenant bypass DISABLED by ${userId} - Reason: ${reason}`,
    );

    // Audit log (fire-and-forget with error handling)
    void this.logBypassAudit(TenantAuditEvents.BYPASS_DISABLED, {
      userId,
      reason,
      tenantId,
    });
  }

  /**
   * Check if a tenant context is available
   * Returns true if organizationId is set and bypass is not enabled
   */
  hasTenantContext(): boolean {
    return !!this.getTenantId() && !this.isBypassEnabled();
  }

  /**
   * Log bypass audit event (Phase 1 - Compliance)
   *
   * FAIL-OPEN STRATEGY:
   * If audit logging fails, we log the error but DO NOT block the operation.
   * The bypass functionality must continue to work for operational continuity.
   *
   * @param action - The audit event type
   * @param context - Bypass context with userId and reason
   */
  private async logBypassAudit(
    action: TenantAuditEvent,
    context: BypassAuditContext,
  ): Promise<void> {
    if (!this.auditLogsService) {
      this.logger.debug('AuditLogsService not available, skipping audit log');
      return;
    }

    try {
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: context.tenantId || 'system',
        actor_id: context.userId,
        resource_type: 'TenantContext',
        resource_id: 'bypass_scope',
        action_type: 'UPDATE',
        action,
        metadata: {
          severity: 'HIGH',
          reason: context.reason,
          bypassState: action === TenantAuditEvents.BYPASS_ENABLED,
        },
      });
    } catch (error: unknown) {
      // FAIL-OPEN: Log error but don't block the bypass operation
      this.logger.error(
        `Failed to log bypass audit event:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}

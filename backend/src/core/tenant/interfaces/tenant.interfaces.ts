/**
 * Tenant Module — Segregated Contract Layer (SOLID Refactor Step 1)
 *
 * These interfaces invert the direction of dependency between
 * `core/tenant` (infrastructure) and the surrounding modules
 * (`audit`, `auth`). Consumers depend on these abstractions via the
 * Symbol tokens defined in `../constants/tenant.tokens.ts` rather than
 * on the concrete `TenantContext` / `AuditLogsService` classes.
 *
 * ISP: Five focused contracts replace the bloated `TenantContext`
 *      surface so read-only consumers no longer transitively depend on
 *      mutator / privilege-escalation methods.
 *
 * DIP: `IBypassAuditWriter` and `ITenantIdentityResolver` allow
 *      `TenantContext` and `TenantInterceptor` to remain agnostic of
 *      the audit pipeline and the JWT payload shape respectively.
 */

import type { Request } from 'express';

// =============================================================================
// VALUE OBJECTS
// =============================================================================

/**
 * Resolved tenant identity for a single inbound request.
 *
 * Returned by {@link ITenantIdentityResolver}. The infrastructure
 * layer never inspects the raw request — it consumes only this
 * abstract value object.
 */
export interface TenantIdentity {
  /** Tenant scope for the request (undefined for public/super-admin endpoints). */
  tenantId?: string;
  /** True for principals that may operate without a tenant scope. */
  isPrivileged: boolean;
}

/**
 * Audited bypass context — captured every time the tenant scope is
 * temporarily widened.
 */
export interface BypassAuditContext {
  /** Actor identifier (user id or `system:<context>`). */
  userId: string;
  /** Operator-supplied justification (SOC 2 evidence). */
  reason: string;
  /** Tenant whose scope is being bypassed (if any). */
  tenantId?: string;
}

/**
 * Discriminator for tenant audit events.
 *
 * Defined as a literal union to keep the contract layer free from
 * runtime concerns. The runtime constant lives alongside the writer
 * implementation in `tenant-context.service.ts`.
 */
export type TenantAuditEvent =
  | 'TENANT_BYPASS_ENABLED'
  | 'TENANT_BYPASS_DISABLED';

// =============================================================================
// SEGREGATED INTERFACES (ISP)
// =============================================================================

/**
 * Read-only access to the request-scoped tenant context.
 *
 * Consume this interface from query / read-side services that must
 * never mutate the tenant scope.
 */
export interface ITenantContextReader {
  /** Current tenant id, or `undefined` for unscoped requests. */
  getTenantId(): string | undefined;
  /** True when an active `@BypassTenantScope` window is in effect. */
  isBypassEnabled(): boolean;
  /** True when a tenant id is set AND bypass is not enabled. */
  hasTenantContext(): boolean;
}

/**
 * Writes the tenant id into the request-scoped context.
 *
 * Reserved for the HTTP entrypoint (interceptor) — application code
 * MUST NOT depend on this contract.
 */
export interface ITenantContextWriter {
  /** Bind the tenant id for the remainder of the request lifecycle. */
  setTenantId(organizationId: string): void;
}

/**
 * Controls the privileged "bypass" window in which tenant filtering
 * is suspended (e.g. cross-tenant admin operations).
 *
 * Implementations MUST emit an audit record via
 * {@link IBypassAuditWriter} for every transition.
 */
export interface ITenantBypassController {
  /** Open a bypass window. `reason` and `userId` are SOC 2 evidence. */
  enableBypass(reason: string, userId: string): void;
  /** Close the bypass window opened by {@link enableBypass}. */
  disableBypass(reason: string, userId: string): void;
}

/**
 * Translates a raw HTTP request into an abstract {@link TenantIdentity}.
 *
 * This contract isolates the tenant module from the JWT payload shape
 * owned by the auth domain. Replace the default JWT-backed
 * implementation with a header-based or session-based adapter without
 * touching the tenant interceptor.
 */
export interface ITenantIdentityResolver {
  resolve(request: Request): TenantIdentity;
}

/**
 * Sink for tenant bypass audit events.
 *
 * The default implementation lives in `audit/adapters/` and forwards
 * to `AuditLogsService`. Tests / minimal builds may bind a no-op
 * implementation.
 */
export interface IBypassAuditWriter {
  recordBypass(
    event: TenantAuditEvent,
    context: BypassAuditContext,
  ): Promise<void>;
}

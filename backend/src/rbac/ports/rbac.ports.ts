/**
 * RBAC Module — Outbound Ports
 *
 * These interfaces describe collaborations the RBAC module DEPENDS ON
 * but does not OWN. Concrete adapters live inside the owning module
 * (audit, membership) and are bound to the tokens declared in
 * `rbac.tokens.ts` via NestJS custom providers.
 *
 * Why ports (not direct imports)
 * ------------------------------
 *  - `IAuditEmitterPort` removes the current direct dependency on the
 *    concrete `AuditLogsService` so RBAC remains framework-thin and
 *    independently testable.
 *  - `IMembershipRoleUsageProbe` replaces the cross-aggregate raw SQL
 *    (`SELECT COUNT(*) FROM project_members WHERE "roleId" = $1`) with a
 *    contract owned by the membership module. RBAC never again touches
 *    a table outside its own aggregate.
 */

// ---------------------------------------------------------------------------
// Audit Emitter Port
// ---------------------------------------------------------------------------

export type RbacAuditAction =
  | 'rbac.role.created'
  | 'rbac.role.permissions_updated'
  | 'rbac.role.deleted';

export interface RbacAuditEvent {
  readonly action: RbacAuditAction;
  readonly actorId: string;
  readonly organizationId: string | null;
  /** UUID of the role being mutated. */
  readonly roleId: string;
  /** Optional, action-specific structured payload (no PII). */
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
}

export interface IAuditEmitterPort {
  emit(event: RbacAuditEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Membership Role Usage Probe
// ---------------------------------------------------------------------------

export interface RoleUsageReport {
  readonly roleId: string;
  readonly assignmentCount: number;
  readonly inUse: boolean;
}

/**
 * Asks the membership module whether a role is currently assigned to any
 * project member. RBAC consults this before destructive operations
 * (delete role, demote role) without ever importing membership entities
 * or executing raw SQL against `project_members`.
 */
export interface IMembershipRoleUsageProbe {
  countAssignments(roleId: string): Promise<number>;
  isInUse(roleId: string): Promise<boolean>;
  report(roleId: string): Promise<RoleUsageReport>;
}

/**
 * Tenant-aware entity contracts (SOLID Refactor Step 2).
 *
 * Extracted out of `tenant.repository.ts` to keep the contract layer
 * decoupled from the implementation. Crucially, the
 * `project: { organizationId }` shortcut that previously baked the
 * `Project` domain entity into infrastructure has been REMOVED — the
 * tenant module now treats every entity as opaque, identified solely
 * by the `tenantField` provided by the consumer (see
 * `TenantRepositoryFactory.create`).
 *
 * Entities that are scoped through a relation (e.g. `Issue → Project →
 * organizationId`) must be wrapped via the join-aware factory method,
 * which receives the field path as an explicit string argument.
 */

import type { ObjectLiteral } from 'typeorm';

/**
 * Marker contract for entities that participate in tenant isolation.
 *
 * The `organizationId` slot is OPTIONAL because some entities are
 * scoped through a relation rather than a column on the entity itself.
 * The actual filter column is supplied by the factory caller.
 */
export interface TenantAwareEntity extends ObjectLiteral {
  organizationId?: string;
}

/**
 * Extension contract for entities that participate in soft delete.
 */
export interface SoftDeletableEntity extends TenantAwareEntity {
  deletedAt?: Date | null;
}

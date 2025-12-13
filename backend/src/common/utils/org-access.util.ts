import { NotFoundException } from '@nestjs/common';

/**
 * Validates that an entity belongs to the specified organization.
 * @param entity The entity to check (must have organizationId property)
 * @param organizationId The organization ID to match against (optional)
 * @param entityName Name of the entity for error messages (default: 'Resource')
 * @throws NotFoundException if organizationId is provided and does not match (to prevent leaking existence)
 */
export function validateOrganizationAccess(
  entity: { organizationId?: string },
  organizationId?: string,
  entityName = 'Resource',
): void {
  // If no organization context is provided, rely on standard permissions
  if (!organizationId) return;

  // If entity has no organization assigned, it might be global or misconfigured.
  // Assuming strict multi-tenancy: if provided orgId doesn't match entity's, deny.
  if (entity.organizationId !== organizationId) {
    // We throw NotFound to avoid leaking that the ID exists but belongs to another org
    throw new NotFoundException(`${entityName} not found`);
  }
}

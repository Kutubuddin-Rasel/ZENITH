/**
 * Abstract Organization Settings Repository — DIP Data Access Token.
 *
 * Encapsulates all data access patterns for OrganizationSettings entities.
 * Concrete Postgres/TypeORM implementation will extend this class.
 *
 * @see OrganizationRepository for the abstract class pattern rationale.
 */

import { OrganizationSettings } from '../../entities/organization-settings.entity';

export abstract class OrganizationSettingsRepository {
  /**
   * Find settings for an organization.
   *
   * @param organizationId - Organization UUID
   * @returns Settings or null if none exist yet
   */
  abstract findOne(
    organizationId: string,
  ): Promise<OrganizationSettings | null>;

  /**
   * Persist settings (insert or update).
   *
   * @param settings - Entity to save
   * @returns Saved entity with generated fields populated
   */
  abstract save(settings: OrganizationSettings): Promise<OrganizationSettings>;

  /**
   * Create a new settings entity instance with defaults.
   * Does NOT persist — caller must call save() after.
   *
   * This mirrors TypeORM's `repository.create()` pattern: instantiate
   * an entity from a partial without hitting the database.
   *
   * @param data - Partial settings data (must include organizationId)
   * @returns Unsaved entity instance
   */
  abstract create(data: Partial<OrganizationSettings>): OrganizationSettings;
}

/**
 * Abstract Organization Repository — DIP Data Access Token.
 *
 * This abstract class serves as the NestJS DI token for organization
 * data access. Concrete implementations (Postgres/TypeORM) extend this
 * class and are bound via `{ provide: OrganizationRepository, useClass: ... }`.
 *
 * WHY ABSTRACT CLASS (not interface):
 * NestJS DI requires a runtime value for the `provide` key. TypeScript
 * interfaces are erased at compile time, so abstract classes serve as
 * both the type contract AND the DI token in a single artifact.
 *
 * @see SOLID_STANDARDS.md — DIP: "Stop injecting concrete classes directly.
 *      Define abstract classes as injection tokens."
 */

import { Organization } from '../../entities/organization.entity';
import { CreateOrganizationDto } from '../../dto/create-organization.dto';

export abstract class OrganizationRepository {
  /**
   * Find organization by primary key (UUID).
   *
   * @param id - Organization UUID
   * @returns Organization or null if not found
   */
  abstract findOne(id: string): Promise<Organization | null>;

  /**
   * Find organization by URL-friendly slug.
   *
   * @param slug - URL slug (e.g., "acme-inc")
   * @returns Organization or null if not found
   */
  abstract findBySlug(slug: string): Promise<Organization | null>;

  /**
   * Persist an organization entity (insert or update).
   *
   * @param organization - Entity to save
   * @returns Saved entity with generated fields populated
   */
  abstract save(organization: Organization): Promise<Organization>;

  /**
   * Create a new organization from DTO.
   * Handles slug generation and uniqueness validation.
   *
   * @param dto - Creation payload
   * @returns Newly created organization
   */
  abstract create(dto: CreateOrganizationDto): Promise<Organization>;

  /**
   * Find organization by Stripe customer ID.
   * Used by billing/webhook services to resolve Stripe events
   * to the correct organization.
   *
   * @param stripeCustomerId - Stripe customer identifier (e.g., "cus_...")
   * @returns Organization or null if no org is linked to this customer
   */
  abstract findByCustomerId(
    stripeCustomerId: string,
  ): Promise<Organization | null>;

  /**
   * Update an organization's subscription status.
   * Used by the billing module to update org billing state
   * without importing the full OrganizationsService.
   *
   * @param orgId - Organization UUID
   * @param status - New subscription status (e.g., 'active', 'past_due', 'canceled')
   * @param metadata - Optional billing metadata (subscriptionId, periodEnd)
   */
  abstract updateSubscriptionStatus(
    orgId: string,
    status: string,
    metadata?: {
      stripeSubscriptionId?: string;
      currentPeriodEnd?: Date;
    },
  ): Promise<Organization>;
}

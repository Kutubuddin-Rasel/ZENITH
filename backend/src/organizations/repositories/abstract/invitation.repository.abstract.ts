/**
 * Abstract Invitation Repository — DIP Data Access Token.
 *
 * Encapsulates all data access patterns for OrganizationInvitation entities.
 * Concrete Postgres/TypeORM implementation will extend this class.
 *
 * @see OrganizationRepository for the abstract class pattern rationale.
 */

import {
  OrganizationInvitation,
  InvitationStatus,
} from '../../entities/organization-invitation.entity';

// ─── Query Options ───────────────────────────────────────────────────
/**
 * Options for finding a single invitation.
 * Mirrors the query patterns used in the existing service.
 */
export interface InvitationFindOptions {
  /** Find by primary key */
  id?: string;
  /** Find by unique token */
  token?: string;
  /** Scope to a specific organization */
  organizationId?: string;
  /** Filter by email address */
  email?: string;
  /** Filter by invitation status */
  status?: InvitationStatus;
  /** Eager-load relations (e.g., ['organization', 'invitedBy']) */
  relations?: string[];
}

/**
 * Options for listing invitations.
 */
export interface InvitationListOptions {
  organizationId: string;
  status?: InvitationStatus;
  /** Eager-load relations */
  relations?: string[];
  /** Order by field and direction */
  orderBy?: { field: string; direction: 'ASC' | 'DESC' };
}

// ─── Abstract Repository ─────────────────────────────────────────────
export abstract class InvitationRepository {
  /**
   * Find a single invitation matching the given criteria.
   *
   * @param options - Query criteria (id, token, org+email+status, etc.)
   * @returns Invitation or null if not found
   */
  abstract findOne(
    options: InvitationFindOptions,
  ): Promise<OrganizationInvitation | null>;

  /**
   * Find multiple invitations matching the given criteria.
   *
   * @param options - List criteria with optional ordering
   * @returns Array of matching invitations
   */
  abstract find(
    options: InvitationListOptions,
  ): Promise<OrganizationInvitation[]>;

  /**
   * Persist an invitation entity (insert or update).
   *
   * @param invitation - Entity to save
   * @returns Saved entity with generated fields populated
   */
  abstract save(
    invitation: OrganizationInvitation,
  ): Promise<OrganizationInvitation>;

  /**
   * Remove an invitation (hard delete).
   *
   * @param invitation - Entity to remove
   */
  abstract remove(invitation: OrganizationInvitation): Promise<void>;

  /**
   * Bulk-expire all pending invitations past their expiry date
   * for a given organization.
   *
   * This replaces the inline TypeORM `update()` call currently in
   * `OrganizationsService.getPendingInvites()`.
   *
   * @param organizationId - Organization UUID
   * @returns Number of invitations expired
   */
  abstract updateExpired(organizationId: string): Promise<number>;
}

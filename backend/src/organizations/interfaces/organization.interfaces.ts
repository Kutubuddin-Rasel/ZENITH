/**
 * Organizations Module — Segregated Interfaces (ISP).
 *
 * Each interface represents a single, focused responsibility extracted
 * from the organizational domain. Consumers inject ONLY the surface
 * they need via the tokens in `../constants/organization.tokens.ts`.
 *
 * ZERO cross-domain entity leakage — all method signatures use
 * domain entities and DTOs from THIS module only.
 *
 * @see SOLID_STANDARDS.md — ISP: "Split bloated interfaces into
 *      role-specific ones so consumers only see the methods they use."
 */

import { Organization } from '../entities/organization.entity';
import { OrganizationInvitation } from '../entities/organization-invitation.entity';
import { OrganizationSettings } from '../entities/organization-settings.entity';
import { CreateOrganizationDto } from '../dto/create-organization.dto';
import { UpdateOrganizationSettingsDto } from '../dto/update-organization-settings.dto';

// ─── IOrganizationReader ─────────────────────────────────────────────
/**
 * Read-only access to organization data.
 *
 * Consumers: Any module that needs to look up organization info
 * without the ability to mutate it (e.g., guards, resolvers, queries).
 */
export interface IOrganizationReader {
  findOne(id: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
}

// ─── IOrganizationWriter ─────────────────────────────────────────────
/**
 * Write access to organization lifecycle.
 *
 * Consumers: Auth module (registration creates org), admin endpoints.
 * Deliberately thin — org creation is the only external write surface.
 */
export interface IOrganizationWriter {
  create(dto: CreateOrganizationDto): Promise<Organization>;
}

// ─── IInvitationService ──────────────────────────────────────────────
/**
 * Full invitation workflow surface.
 *
 * Owns: Token generation, validation gates (domain check, duplicate
 * prevention, expiry), acceptance flow, revocation, and listing.
 *
 * SECURITY: 256-bit hex tokens, 7-day expiration, auto-expire on query.
 */
export interface IInvitationService {
  inviteUser(
    organizationId: string,
    email: string,
    role: string,
    invitedById: string,
  ): Promise<{ token: string }>;

  validateInvite(token: string): Promise<OrganizationInvitation>;

  acceptInvite(token: string, userId: string): Promise<OrganizationInvitation>;

  revokeInvite(organizationId: string, inviteId: string): Promise<void>;

  getPendingInvites(organizationId: string): Promise<OrganizationInvitation[]>;
}

// ─── IOrganizationSettingsReader ─────────────────────────────────────
/**
 * Read-only access to organization settings.
 *
 * Consumers: Invitation service (domain restriction check),
 * guards (feature flag checks), read-only settings endpoints.
 *
 * PATTERN: Lazy initialization via getOrCreate — no migration backfill.
 */
export interface IOrganizationSettingsReader {
  getOrCreate(organizationId: string): Promise<OrganizationSettings>;
  isEmailDomainAllowed(organizationId: string, email: string): Promise<boolean>;
}

// ─── IOrganizationSettingsWriter ─────────────────────────────────────
/**
 * Write access to organization settings.
 *
 * Consumers: Admin settings endpoints only.
 */
export interface IOrganizationSettingsWriter {
  update(
    organizationId: string,
    dto: UpdateOrganizationSettingsDto,
  ): Promise<OrganizationSettings>;
}

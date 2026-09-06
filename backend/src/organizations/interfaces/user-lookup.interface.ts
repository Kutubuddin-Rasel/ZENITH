/**
 * IUserLookup — Localized User Access Interface.
 *
 * Breaks the circular dependency between organizations and users modules.
 * The organizations module defines WHAT it needs from users, and the
 * users module provides a concrete implementation bound via DI token.
 *
 * This follows the Dependency Inversion Principle: the organizations
 * module owns the interface, not the users module.
 *
 * @see SOLID_STANDARDS.md — DIP: "High-level modules should not
 *      depend on low-level modules. Both should depend on abstractions."
 */

/**
 * Minimal user shape returned by IUserLookup.
 * Avoids importing the full User entity from the users module.
 */
export interface UserLookupResult {
  id: string;
  email: string;
  name: string;
  organizationId?: string;
}

/**
 * User lookup contract consumed by InvitationService.
 *
 * Methods mirror the exact UsersService surface that was previously
 * coupled into OrganizationsService:
 * - findOneByEmail: membership check during invite
 * - findOneById: inviter name resolution + invite acceptance
 * - update: assign user to org on invite accept
 */
export interface IUserLookup {
  findOneByEmail(email: string): Promise<UserLookupResult | null>;
  findOneById(id: string): Promise<UserLookupResult>;
  update(
    id: string,
    data: Partial<UserLookupResult>,
  ): Promise<UserLookupResult>;
}

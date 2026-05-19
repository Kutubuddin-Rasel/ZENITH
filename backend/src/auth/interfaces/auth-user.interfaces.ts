/**
 * Auth ↔ Users adapter contracts.
 *
 * These interfaces eliminate the last `@InjectRepository(User)` violations
 * in the auth module. Auth services depend on these abstractions; the
 * `users` module supplies a concrete adapter that wraps `UsersService` /
 * the `User` TypeORM repository.
 *
 * @see SOLID_STANDARDS.md — DIP
 */

import { AuthPrincipal } from './core.interfaces';

/**
 * Extension of {@link AuthPrincipal} that carries the materials needed for
 * local-credential validation. Returned only by
 * `IAuthUserReader.findByEmailForCredential` — never by the lookup methods.
 */
export interface CredentialBoundUser extends AuthPrincipal {
  readonly passwordHash: string;
  readonly mustChangePassword: boolean;
  /** Hashing scheme version — used by lazy password upgrade. */
  readonly passwordVersion: number;
}

/** JIT-provisioning payload sent into the users module from SAML flows. */
export interface SAMLProvisionUserInput {
  readonly email: string;
  readonly name: string;
  readonly isSuperAdmin: boolean;
  readonly isActive: boolean;
  readonly organizationId?: string;
}

/**
 * Idempotent identity refresh applied on every successful SAML login.
 * Mirrors whatever the IdP currently asserts (name, superAdmin, active).
 */
export interface SAMLUserIdentityPatch {
  readonly name: string;
  readonly isSuperAdmin: boolean;
  readonly isActive: boolean;
}

/**
 * Read-side projection of the users module for the auth layer.
 * Returns the narrow {@link AuthPrincipal} shape — no TypeORM entities.
 */
export interface IAuthUserReader {
  findById(userId: string): Promise<AuthPrincipal | null>;
  findByEmail(email: string): Promise<AuthPrincipal | null>;
  /**
   * Loads the user with hash-bearing columns for credential matching.
   * Implementations MUST opt the password columns in explicitly
   * (`select: false` on the entity).
   */
  findByEmailForCredential(email: string): Promise<CredentialBoundUser | null>;
}

/**
 * Write-side adapter — strictly the mutations the SAML JIT flow needs.
 * Local registration / password change continue to live in the users
 * module and are NOT exposed through this contract.
 */
export interface IAuthUserWriter {
  createFromSAML(input: SAMLProvisionUserInput): Promise<AuthPrincipal>;
  updateIdentityFromSAML(
    userId: string,
    patch: SAMLUserIdentityPatch,
  ): Promise<AuthPrincipal>;
}

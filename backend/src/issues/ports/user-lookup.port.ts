/**
 * Issues Module — Outbound Port: UserLookupPort
 *
 * The issues god class historically injected the concrete `UsersService`
 * (made app-global by `UsersCoreModule`) purely to answer two questions
 * during command/import flows:
 *   - "is the acting user a super-admin?" (archive/unarchive authz)
 *   - "what is the user id for this assignee email?" (CSV import)
 *
 * Depending on the concrete `UsersService` violates DIP (severity CRITICAL
 * per `SOLID_STANDARDS.md`) and welds issues to the full `User` entity shape.
 *
 * Inversion strategy (exact mirror of boards' `WorkflowLookupPort`):
 *   - issues (the *consumer*) owns this contract.
 *   - the users aggregate (the *capability owner*) binds the adapter in its
 *     `@Global UsersCoreModule` via
 *       `{ provide: UserLookupPort, useClass: UserLookupAdapter }`
 *     and re-exports the token — so the port inherits the same global reach
 *     `UsersService` already has, and `issues.module` needs no new import.
 *
 * Why a class, not an interface? NestJS resolves the binding by reference
 * identity on the class symbol — abstract classes double as their own DI
 * token, mirroring `BoardRepository` and `WorkflowLookupPort`. An interface
 * would force a parallel `Symbol` token.
 */

/**
 * Slim projection of a `User` row — only the two fields the issues
 * command/import paths read. Excludes name, email, password hash, and the
 * rest of the entity, so the users aggregate can evolve freely.
 */
export interface UserLookupResult {
  readonly id: string;
  readonly isSuperAdmin: boolean;
}

export abstract class UserLookupPort {
  /**
   * Resolve a user by id. Returns `null` when no row matches — callers gate
   * on `result?.isSuperAdmin` so a missing user degrades to "not admin".
   */
  abstract findOneById(userId: string): Promise<UserLookupResult | null>;

  /**
   * Resolve a user by email (CSV-import assignee resolution). Returns `null`
   * when the email maps to no user.
   */
  abstract findOneByEmail(email: string): Promise<UserLookupResult | null>;
}

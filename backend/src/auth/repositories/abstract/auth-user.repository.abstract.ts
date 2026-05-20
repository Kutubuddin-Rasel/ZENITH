import { User } from '../../../users/entities/user.entity';

/**
 * Step 2 — DIP injection token that encapsulates the `User` entity for the
 * auth module. Concrete TypeORM implementation lives in
 * `auth/repositories/concrete/postgres-auth-user.repository.ts`.
 *
 * SCOPE: only the read/write verbs that the auth services currently need
 * (SAML JIT provisioning, 2FA admin lookup). Local-registration and
 * password-change writes continue to flow through `UsersService` and are
 * NOT exposed here.
 */
export abstract class AuthUserRepository {
  /** Lookup by primary key. Resolves to `null` when no row exists. */
  abstract findById(id: string): Promise<User | null>;

  /** Lookup by email. Caller is responsible for any case normalisation. */
  abstract findByEmail(email: string): Promise<User | null>;

  /**
   * Factory — returns an unsaved entity instance seeded with `partial`.
   * No I/O. Callers must `save` to persist.
   */
  abstract create(seed: Partial<User>): User;

  /** Persist (insert or update) the supplied entity. */
  abstract save(user: User): Promise<User>;
}

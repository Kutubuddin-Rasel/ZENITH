import { TwoFactorAuth } from '../../entities/two-factor-auth.entity';

/**
 * Step 2 — DIP injection token for the 2FA secret store. Concrete TypeORM
 * implementation lives in
 * `auth/repositories/concrete/postgres-two-factor-auth.repository.ts`.
 *
 * Encapsulates the common `isEnabled: true` filter as a distinct verb so
 * service code never re-binds that policy at the call site.
 */
export abstract class TwoFactorAuthRepository {
  /** Find the 2FA row for a user regardless of enabled state. */
  abstract findByUserId(userId: string): Promise<TwoFactorAuth | null>;

  /** Find the 2FA row only when it is currently enabled. */
  abstract findEnabledByUserId(userId: string): Promise<TwoFactorAuth | null>;

  /**
   * Factory — returns an unsaved entity instance seeded with `partial`.
   * No I/O. Callers must `save` to persist.
   */
  abstract create(seed: Partial<TwoFactorAuth>): TwoFactorAuth;

  /** Persist (insert or update) the supplied entity. */
  abstract save(tfa: TwoFactorAuth): Promise<TwoFactorAuth>;

  /** Hard-delete the supplied entity. */
  abstract remove(tfa: TwoFactorAuth): Promise<void>;
}

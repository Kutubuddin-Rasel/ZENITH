import { SAMLConfig } from '../../entities/saml-config.entity';

/**
 * Step 2 — DIP injection token for the SAML configuration store. Concrete
 * TypeORM implementation lives in
 * `auth/repositories/concrete/postgres-saml-config.repository.ts`.
 *
 * The abstract intentionally encapsulates two policy verbs
 * (`demoteActiveConfigs`, `findActive`) so callers never need to know that
 * "active" is a `SAMLStatus.ACTIVE` enum stored on the row.
 */
export abstract class SAMLConfigRepository {
  /** Lookup by primary key. Resolves to `null` when no row exists. */
  abstract findById(id: string): Promise<SAMLConfig | null>;

  /** The single currently-active config, or `null` when SSO is disabled. */
  abstract findActive(): Promise<SAMLConfig | null>;

  /** All configurations, most-recently-created first. */
  abstract listOrderedByCreatedDesc(): Promise<SAMLConfig[]>;

  /**
   * Factory — returns an unsaved entity instance seeded with `partial`.
   * No I/O. Callers must `save` to persist.
   */
  abstract create(seed: Partial<SAMLConfig>): SAMLConfig;

  /** Persist (insert or update) the supplied entity. */
  abstract save(config: SAMLConfig): Promise<SAMLConfig>;

  /** Hard-delete the supplied entity. */
  abstract remove(config: SAMLConfig): Promise<void>;

  /**
   * Demote every currently-active configuration to `INACTIVE`. Used by the
   * activation workflow to guarantee at-most-one active config.
   */
  abstract demoteActiveConfigs(): Promise<void>;
}

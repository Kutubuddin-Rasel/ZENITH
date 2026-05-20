import { Permission } from '../../entities/permission.entity';

/**
 * Abstract Permission Repository (DIP Boundary)
 *
 * Defines the persistence contract for the permission catalog. The RBAC
 * service depends ONLY on this abstract; concrete TypeORM access lives
 * in `repositories/postgres/postgres-permission.repository.ts`.
 */

export interface PermissionCreateInput {
  readonly resource: string;
  readonly action: string;
  readonly description?: string | null;
  readonly displayName?: string | null;
}

export abstract class AbstractPermissionRepository {
  /** Unordered catalog read — used by seeding existence checks. */
  abstract findAll(): Promise<Permission[]>;

  /** Catalog read sorted by `(resource, action)` — used by admin UIs. */
  abstract findAllOrdered(): Promise<Permission[]>;

  /** Hydrate a set of permissions by id. */
  abstract findByIds(ids: readonly string[]): Promise<Permission[]>;

  /** Lookup by canonical composite key. */
  abstract findByResourceAction(
    resource: string,
    action: string,
  ): Promise<Permission | null>;

  /** Bulk insert. Caller has already deduplicated against existing catalog. */
  abstract createMany(
    inputs: readonly PermissionCreateInput[],
  ): Promise<Permission[]>;
}

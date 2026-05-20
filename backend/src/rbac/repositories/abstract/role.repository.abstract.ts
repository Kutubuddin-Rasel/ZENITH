import { Role } from '../../entities/role.entity';
import { Permission } from '../../entities/permission.entity';

/**
 * Abstract Role Repository (DIP Boundary)
 *
 * Defines the persistence contract for `Role` aggregates. The RBAC
 * service depends ONLY on this abstract — never on TypeORM's
 * `Repository<Role>` directly. The Postgres concrete (Step 2) and any
 * future store (read replica, projection, fake) implement this surface.
 *
 * Relation Loading
 * ----------------
 * `eager: true` was removed from `Role.permissions` so every read path
 * is now explicit about whether it needs permissions and/or the parent
 * relationship. The method names below encode the intent.
 *
 * Persistence shape
 * -----------------
 * The TypeORM `Role` entity is still exposed here because it is the
 * canonical aggregate shape inside the RBAC module. External consumers
 * never see it — they go through `IRoleQueryService` / `IRoleCommandService`
 * DTOs declared in `interfaces/rbac.interfaces.ts`.
 */

export interface RoleCreateInput {
  readonly name: string;
  readonly description: string | null;
  readonly organizationId: string | null;
  readonly isSystemRole: boolean;
  readonly legacyEnumValue: string | null;
  readonly color: string | null;
  readonly sortOrder: number;
  readonly parentRoleId: string | null;
  readonly permissions: readonly Permission[];
}

export abstract class AbstractRoleRepository {
  // ---- Reads ---------------------------------------------------------------

  abstract findById(id: string): Promise<Role | null>;
  abstract findByIdWithPermissions(id: string): Promise<Role | null>;
  abstract findByIdWithPermissionsAndParent(id: string): Promise<Role | null>;
  abstract findByLegacyEnumValue(value: string): Promise<Role | null>;
  abstract findByOrganizationAndName(
    organizationId: string,
    name: string,
  ): Promise<Role | null>;
  abstract findSystemRoles(): Promise<Role[]>;
  abstract findForOrganization(organizationId: string): Promise<Role[]>;

  // ---- Writes --------------------------------------------------------------

  /** Create + persist a role with its initial permission set. */
  abstract create(input: RoleCreateInput): Promise<Role>;

  /** Replace a role's permission set and persist. Returns the saved role. */
  abstract replacePermissions(
    role: Role,
    permissions: readonly Permission[],
  ): Promise<Role>;

  /** Hard-delete a role aggregate. Callers must enforce business rules first. */
  abstract remove(role: Role): Promise<void>;
}

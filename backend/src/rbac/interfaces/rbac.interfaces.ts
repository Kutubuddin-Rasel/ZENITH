/**
 * RBAC Module — Abstract Contracts (ISP Surface)
 *
 * These interfaces are the ONLY allowed coupling point between the RBAC
 * module and the rest of Zenith. Concrete services, repositories, and
 * persistence entities are implementation details that must never leak
 * across the module boundary.
 *
 * DTO Strategy
 * ------------
 * `RoleSummary`, `RoleDetails`, and `PermissionDescriptor` are pure
 * value-object views — they intentionally do NOT extend the TypeORM
 * `Role` / `Permission` entities so consumers cannot accidentally depend
 * on ORM metadata, lifecycle decorators, or lazy relations.
 *
 * Segregation Rationale (ISP)
 * ---------------------------
 *  - Query / Command split keeps read-heavy consumers (CASL factory,
 *    permission guards) decoupled from mutating capabilities (admin UI).
 *  - `IPermissionPolicyService` is the narrow check-only surface used by
 *    every hot-path authorization site.
 *  - `IRoleHierarchyResolver` isolates the recursive inheritance walk so
 *    it can be unit-tested without DB or cache fakes.
 *  - `IPermissionCacheStore` is a port — the in-process Map will be
 *    replaced by a Redis-backed implementation in Step 6 without any
 *    consumer-side change.
 *  - `IRbacSeeder` isolates lifecycle / bootstrap concerns so the policy
 *    services no longer carry `onModuleInit` responsibilities.
 */

// ---------------------------------------------------------------------------
// Value-Object Views (DTOs)
// ---------------------------------------------------------------------------

export interface PermissionDescriptor {
  readonly id: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string | null;
  readonly displayName: string | null;
  /** Canonical `resource:action` form. */
  readonly key: string;
}

export interface RoleSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly organizationId: string | null;
  readonly isSystemRole: boolean;
  readonly legacyEnumValue: string | null;
  readonly color: string | null;
  readonly sortOrder: number;
  readonly parentRoleId: string | null;
}

export interface RoleDetails extends RoleSummary {
  readonly permissions: readonly PermissionDescriptor[];
}

// ---------------------------------------------------------------------------
// Command DTOs (input contracts for the write-side surface)
// ---------------------------------------------------------------------------

export interface CreateRoleCommand {
  readonly name: string;
  readonly description?: string | null;
  readonly organizationId: string;
  readonly parentRoleId?: string | null;
  readonly permissionIds: readonly string[];
  readonly color?: string | null;
  readonly sortOrder?: number;
  readonly createdBy: string;
}

export interface UpdateRolePermissionsCommand {
  readonly roleId: string;
  readonly organizationId: string;
  readonly permissionIds: readonly string[];
  readonly updatedBy: string;
}

export interface DeleteRoleCommand {
  readonly roleId: string;
  readonly organizationId: string;
  readonly deletedBy: string;
}

// ---------------------------------------------------------------------------
// Role Surfaces — Query / Command split
// ---------------------------------------------------------------------------

export interface IRoleQueryService {
  findById(id: string): Promise<RoleDetails | null>;
  findByLegacyEnum(enumValue: string): Promise<RoleDetails | null>;
  listSystemRoles(): Promise<readonly RoleSummary[]>;
  listOrganizationRoles(
    organizationId: string,
  ): Promise<readonly RoleSummary[]>;
}

export interface IRoleCommandService {
  createCustomRole(command: CreateRoleCommand): Promise<RoleDetails>;
  updateRolePermissions(
    command: UpdateRolePermissionsCommand,
  ): Promise<RoleDetails>;
  deleteRole(command: DeleteRoleCommand): Promise<void>;
}

// ---------------------------------------------------------------------------
// Permission Surfaces
// ---------------------------------------------------------------------------

export interface IPermissionQueryService {
  listAll(): Promise<readonly PermissionDescriptor[]>;
  groupByResource(): Promise<
    Readonly<Record<string, readonly PermissionDescriptor[]>>
  >;
}

/**
 * Narrow hot-path authorization surface. Every guard, CASL ability, and
 * cross-cutting concern (circuit-breaker, scheduled jobs) consumes RBAC
 * exclusively through this interface.
 */
export interface IPermissionPolicyService {
  hasPermission(
    roleId: string,
    resource: string,
    action: string,
  ): Promise<boolean>;
  hasAllPermissions(
    roleId: string,
    permissionKeys: readonly string[],
  ): Promise<boolean>;
  hasAnyPermission(
    roleId: string,
    permissionKeys: readonly string[],
  ): Promise<boolean>;
  /** Returns the fully-resolved (own + inherited) permission key set. */
  resolveRolePermissions(roleId: string): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// Hierarchy Resolver — isolated recursion + cycle detection
// ---------------------------------------------------------------------------

export interface IRoleHierarchyResolver {
  /**
   * Resolve the full ancestor permission set for `roleId`, applying the
   * MAX_INHERITANCE_DEPTH safeguard and cycle detection.
   */
  resolveInheritedPermissions(roleId: string): Promise<readonly string[]>;

  /**
   * Returns true if assigning `candidateParentRoleId` as the parent of
   * `childRoleId` would create a cycle in the role hierarchy graph.
   */
  wouldIntroduceCycle(
    childRoleId: string,
    candidateParentRoleId: string,
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Cache Port — Map today, Redis tomorrow
// ---------------------------------------------------------------------------

export interface IPermissionCacheStore {
  get(roleId: string): Promise<readonly string[] | null>;
  set(
    roleId: string,
    permissionKeys: readonly string[],
    ttlSeconds?: number,
  ): Promise<void>;
  invalidate(roleId: string): Promise<void>;
  invalidateAll(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Bootstrap Seeder — lifecycle isolation
// ---------------------------------------------------------------------------

export interface IRbacSeeder {
  /**
   * Idempotently seed the canonical permission catalog and standard
   * system roles. Implementations must be safe to invoke concurrently
   * from multiple pods (advisory lock or equivalent).
   */
  seed(): Promise<void>;
}

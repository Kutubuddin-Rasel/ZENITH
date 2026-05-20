/**
 * RBAC Domain Functions
 *
 * Pure functions previously expressed as methods on the TypeORM
 * `Role` / `Permission` entities. Extracted here so the entities remain
 * thin persistence shells (SRP) and the domain logic is decoupled from
 * the ORM lifecycle, easily unit-testable, and tree-shakable.
 *
 * Inputs are described structurally (`PermissionView`, `RoleView`) so
 * these functions also operate on DTOs, plain query results, or
 * test-time literals — never just on hydrated entities.
 */

// ---------------------------------------------------------------------------
// Structural views — no entity imports, no ORM coupling
// ---------------------------------------------------------------------------

export interface PermissionView {
  readonly resource: string;
  readonly action: string;
}

export interface RolePermissionView {
  readonly permissions?: readonly PermissionView[] | null;
  readonly parentRoleId?: string | null;
}

// ---------------------------------------------------------------------------
// Permission key composition
// ---------------------------------------------------------------------------

/**
 * Canonical permission key in `resource:action` form.
 *
 * This is the single source of truth for permission identity. All cache
 * keys, CASL ability rules, and audit payloads MUST go through this
 * function — never inline a `${resource}:${action}` template.
 */
export function permissionKey(p: PermissionView): string {
  return `${p.resource}:${p.action}`;
}

/**
 * Extract a normalized list of permission keys from any permission
 * collection (entities, DTOs, raw rows). Returns `[]` for null/empty.
 */
export function toPermissionKeys(
  permissions: readonly PermissionView[] | null | undefined,
): string[] {
  if (!permissions || permissions.length === 0) {
    return [];
  }
  return permissions.map(permissionKey);
}

/**
 * Parse a `resource:action` key back into its components. Returns
 * `null` if the input does not match the canonical shape — callers
 * should treat that as a programmer error.
 */
export function parsePermissionKey(key: string): PermissionView | null {
  const sep = key.indexOf(':');
  if (sep <= 0 || sep === key.length - 1) {
    return null;
  }
  return {
    resource: key.slice(0, sep),
    action: key.slice(sep + 1),
  };
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

/**
 * Pure check: does this role's DIRECT (non-inherited) permission set
 * contain `resource:action`? Inheritance walking is the responsibility
 * of the hierarchy resolver — never duplicate it here.
 */
export function roleHasDirectPermission(
  role: RolePermissionView,
  resource: string,
  action: string,
): boolean {
  return (
    role.permissions?.some(
      (p) => p.resource === resource && p.action === action,
    ) ?? false
  );
}

/**
 * Pure check: is this role part of an inheritance hierarchy?
 */
export function roleHasParent(role: RolePermissionView): boolean {
  return role.parentRoleId !== null && role.parentRoleId !== undefined;
}

/**
 * Diff two permission-key sets and return `{ added, removed }`. Used by
 * the audit pipeline when role permissions are rotated.
 */
export function diffPermissionKeys(
  before: readonly string[],
  after: readonly string[],
): { readonly added: readonly string[]; readonly removed: readonly string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((k) => !beforeSet.has(k));
  const removed = before.filter((k) => !afterSet.has(k));
  return { added, removed };
}

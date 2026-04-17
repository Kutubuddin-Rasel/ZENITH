/**
 * Role Hierarchy — Static Weight Map for Project Role Authorization
 *
 * DESIGN DECISION:
 * This hierarchy uses the legacy `ProjectRole` enum (roleName) as the key,
 * NOT the dynamic `roleId`. This is intentional:
 *
 *   1. `roleName` is populated on ALL ProjectMember records today
 *   2. `roleId` is nullable (only populated after migration)
 *   3. The hierarchy must work NOW, before the roleId migration completes
 *   4. When roleId migration is complete, this can be replaced with
 *      database-backed permission inheritance via the Role entity
 *
 * WEIGHT SCALE:
 *   10 = Full project authority (ProjectLead)
 *    1 = Minimal access (Guest)
 *
 * USE CASES:
 *   - Prevent privilege escalation (Developer can't assign ProjectLead)
 *   - Authorization checks in addMember/updateRole
 *   - Permission inheritance validation
 *
 * @see ProjectRole enum for role definitions
 * @see ProjectMembersService for integration points
 */

import { ProjectRole } from './enums/project-role.enum';

// =============================================================================
// ROLE WEIGHT MAP
// =============================================================================

/**
 * Static weight map for role hierarchy.
 * Higher weight = more authority.
 *
 * Ordering rationale:
 * - ProjectLead (10): Full project authority, team management
 * - QA (8): Can view/update issues, manage quality
 * - Developer (7): Can create/manage issues, sprints, boards
 * - Designer (6): Can manage design-related issues
 * - Member (5): Legacy general member role (deprecated, alias for Developer)
 * - Viewer (3): Read-only access
 * - Guest (1): Limited read-only access
 */
const ROLE_WEIGHT: Readonly<Record<ProjectRole, number>> = {
  [ProjectRole.PROJECT_LEAD]: 10,
  [ProjectRole.QA]: 8,
  [ProjectRole.DEVELOPER]: 7,
  [ProjectRole.DESIGNER]: 6,
  [ProjectRole.MEMBER]: 5,
  [ProjectRole.VIEWER]: 3,
  [ProjectRole.GUEST]: 1,
} as const;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get the numeric weight of a role.
 *
 * @param role - The ProjectRole to check
 * @returns Numeric weight (1-10)
 */
export function getRoleWeight(role: ProjectRole): number {
  return ROLE_WEIGHT[role];
}

/**
 * Check if role `a` is higher than or equal to role `b`.
 *
 * @example
 *   isRoleHigherOrEqual(ProjectRole.PROJECT_LEAD, ProjectRole.DEVELOPER) // true
 *   isRoleHigherOrEqual(ProjectRole.VIEWER, ProjectRole.DEVELOPER)       // false
 */
export function isRoleHigherOrEqual(
  a: ProjectRole,
  b: ProjectRole,
): boolean {
  return ROLE_WEIGHT[a] >= ROLE_WEIGHT[b];
}

/**
 * Check if an actor with `actorRole` can assign/manage `targetRole`.
 *
 * RULE: An actor can only assign roles at or below their own level.
 * This prevents privilege escalation attacks where a Developer
 * assigns themselves ProjectLead.
 *
 * @param actorRole  - Role of the user performing the action
 * @param targetRole - Role being assigned to the target user
 * @returns true if the actor has authority to assign the target role
 *
 * @example
 *   canManageRole(ProjectRole.PROJECT_LEAD, ProjectRole.DEVELOPER) // true
 *   canManageRole(ProjectRole.DEVELOPER, ProjectRole.PROJECT_LEAD) // false
 *   canManageRole(ProjectRole.DEVELOPER, ProjectRole.DEVELOPER)    // true (same level)
 */
export function canManageRole(
  actorRole: ProjectRole,
  targetRole: ProjectRole,
): boolean {
  return ROLE_WEIGHT[actorRole] >= ROLE_WEIGHT[targetRole];
}

/**
 * @deprecated ProjectRole enum is DEPRECATED and will be removed in v2.0.
 *
 * Migration Guide:
 * - Use database-backed roles via RBACService instead
 * - Roles are now stored in the 'roles' table with dynamic permissions
 * - Auto-seeded standard roles maintain backward compatibility
 *
 * For legacy code compatibility:
 * - Use RBACService.getRoleByLegacyEnum(roleName) to get the Role entity
 * - ProjectMember.roleId now references the database Role entity
 *
 * @see RBACService for the new dynamic role-based access control
 */

/**
 * @deprecated Use database-backed roles via RBACService instead. Will be removed in v2.0.
 *
 * This enum exists only for backward compatibility with existing code.
 * New code should use:
 * - RBACService.getRoleByLegacyEnum() for legacy migrations
 * - RBACService.getRoleById() for dynamic role resolution
 * - RBACService.getRolePermissions() for permission checks
 */
export enum ProjectRole {
  /** Full project access with team management */
  PROJECT_LEAD = 'ProjectLead',

  /** Quality assurance - can view and update issues */
  QA = 'QA',

  /** Can create and manage issues, sprints, and boards */
  DEVELOPER = 'Developer',

  /** Can view project and manage design-related issues */
  DESIGNER = 'Designer',

  /**
   * @deprecated Use DEVELOPER instead
   */
  MEMBER = 'Member',

  /** Read-only access to project resources */
  VIEWER = 'Viewer',

  /** Limited read-only access */
  GUEST = 'Guest',
}

// Log deprecation warning when this module is imported
if (process.env.NODE_ENV !== 'production') {
  console.warn(
    '\x1b[33m%s\x1b[0m', // Yellow color
    '[DEPRECATION WARNING] ProjectRole enum is deprecated. ' +
      'Use database-backed roles via RBACService instead. ' +
      'This enum will be removed in v2.0.',
  );
}

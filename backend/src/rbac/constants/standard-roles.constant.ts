/**
 * Canonical seed data for the RBAC system roles.
 *
 * Lifted out of the legacy `rbac.service.ts` god-class as part of
 * Step 3 of the RBAC refactor — the bootstrap seeder
 * (`RbacSeederService`) is the only consumer. The list is intentionally
 * data-only: no behavior, no imports — so tests and migrations can
 * import it freely without dragging the seeder graph in.
 *
 * Each entry maps the legacy `ProjectRole` enum value to the canonical
 * permission set so the migration from the hardcoded enum to the
 * database-backed model remains lossless.
 */

export interface StandardRoleDefinition {
  readonly name: string;
  readonly legacyEnumValue: string;
  readonly description: string;
  readonly color: string;
  readonly sortOrder: number;
  /** Permission keys in canonical `resource:action` form. */
  readonly permissions: readonly string[];
}

export const STANDARD_ROLES: readonly StandardRoleDefinition[] = [
  {
    name: 'Project Lead',
    legacyEnumValue: 'ProjectLead',
    description: 'Full project access with team management capabilities',
    color: '#ef4444',
    sortOrder: 1,
    permissions: [
      'projects:view',
      'projects:update',
      'projects:delete',
      'projects:settings',
      'issues:view',
      'issues:create',
      'issues:update',
      'issues:delete',
      'issues:assign',
      'comments:view',
      'comments:create',
      'comments:update',
      'comments:delete',
      'members:view',
      'members:add',
      'members:remove',
      'members:update',
      'sprints:view',
      'sprints:create',
      'sprints:update',
      'sprints:delete',
      'boards:view',
      'boards:create',
      'boards:update',
      'boards:delete',
      'releases:view',
      'releases:create',
      'releases:update',
      'releases:delete',
    ],
  },
  {
    name: 'Developer',
    legacyEnumValue: 'Developer',
    description: 'Can create and manage issues, sprints, and boards',
    color: '#3b82f6',
    sortOrder: 2,
    permissions: [
      'projects:view',
      'issues:view',
      'issues:create',
      'issues:update',
      'issues:assign',
      'comments:view',
      'comments:create',
      'comments:update',
      'members:view',
      'sprints:view',
      'sprints:update',
      'boards:view',
      'boards:update',
      'releases:view',
    ],
  },
  {
    name: 'QA',
    legacyEnumValue: 'QA',
    description: 'Quality assurance - can view and update issues',
    color: '#10b981',
    sortOrder: 3,
    permissions: [
      'projects:view',
      'issues:view',
      'issues:create',
      'issues:update',
      'comments:view',
      'comments:create',
      'comments:update',
      'members:view',
      'sprints:view',
      'boards:view',
      'releases:view',
    ],
  },
  {
    name: 'Designer',
    legacyEnumValue: 'Designer',
    description: 'Can view project and manage design-related issues',
    color: '#8b5cf6',
    sortOrder: 4,
    permissions: [
      'projects:view',
      'issues:view',
      'issues:create',
      'issues:update',
      'comments:view',
      'comments:create',
      'comments:update',
      'members:view',
      'boards:view',
    ],
  },
  {
    name: 'Viewer',
    legacyEnumValue: 'Viewer',
    description: 'Read-only access to project resources',
    color: '#6b7280',
    sortOrder: 5,
    permissions: [
      'projects:view',
      'issues:view',
      'comments:view',
      'members:view',
      'sprints:view',
      'boards:view',
      'releases:view',
    ],
  },
  {
    name: 'Guest',
    legacyEnumValue: 'Guest',
    description: 'Limited read-only access',
    color: '#9ca3af',
    sortOrder: 6,
    permissions: ['projects:view', 'issues:view', 'comments:view'],
  },
];

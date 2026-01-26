import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { AuditLogsService } from '../audit/audit-logs.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Standard role definitions for auto-seeding
 * Maps legacy ProjectRole enum values to their default permissions
 */
interface StandardRoleDefinition {
  name: string;
  legacyEnumValue: string;
  description: string;
  color: string;
  sortOrder: number;
  permissions: string[]; // resource:action format
}

const STANDARD_ROLES: StandardRoleDefinition[] = [
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

/**
 * RBAC Service
 *
 * Provides database-backed permission checking for the dynamic RBAC system.
 * Replaces the old hardcoded ProjectRole enum checks with flexible DB queries.
 *
 * Key Features:
 * - Check if a role has specific permissions
 * - Create custom organization-specific roles
 * - Get role by legacy enum for backward compatibility
 * - Full audit trail for all role/permission changes (SOC 2 / ISO 27001)
 * - Auto-seeds standard roles on startup (Phase 5)
 */
@Injectable()
export class RBACService implements OnModuleInit {
  private readonly logger = new Logger(RBACService.name);

  // Cache for role permissions (5-minute TTL)
  private permissionCache = new Map<
    string,
    { permissions: string[]; expiry: number }
  >();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly dataSource: DataSource,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ===========================================================================
  // LIFECYCLE HOOKS - AUTO-SEEDING (Phase 5)
  // ===========================================================================

  /**
   * Auto-seed standard roles and permissions on module initialization
   * Ensures the database has all required roles when migrating from hardcoded enum
   */
  async onModuleInit(): Promise<void> {
    this.logger.log(
      'RBAC Module initializing - checking for standard roles...',
    );

    try {
      await this.seedPermissions();
      await this.seedStandardRoles();
      this.logger.log('RBAC Module initialized successfully');
    } catch (error) {
      this.logger.error(
        `Failed to seed RBAC data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Don't throw - allow app to start even if seeding fails
    }
  }

  /**
   * Seed all standard permissions if they don't exist
   */
  private async seedPermissions(): Promise<void> {
    const allPermissionStrings = new Set<string>();

    // Collect all permission strings from standard roles
    for (const role of STANDARD_ROLES) {
      for (const perm of role.permissions) {
        allPermissionStrings.add(perm);
      }
    }

    // Check which permissions already exist
    const existingPermissions = await this.permissionRepository.find();
    const existingSet = new Set(
      existingPermissions.map((p) => `${p.resource}:${p.action}`),
    );

    // Create missing permissions
    const permissionsToCreate: Permission[] = [];
    for (const permString of allPermissionStrings) {
      if (!existingSet.has(permString)) {
        const [resource, action] = permString.split(':');
        const permission = this.permissionRepository.create({
          resource,
          action,
          description: `${action} ${resource}`,
        });
        permissionsToCreate.push(permission);
      }
    }

    if (permissionsToCreate.length > 0) {
      await this.permissionRepository.save(permissionsToCreate);
      this.logger.log(`Seeded ${permissionsToCreate.length} new permissions`);
    }
  }

  /**
   * Seed standard roles if they don't exist
   */
  private async seedStandardRoles(): Promise<void> {
    for (const roleDef of STANDARD_ROLES) {
      // Check if role already exists by legacy enum value
      const existing = await this.roleRepository.findOne({
        where: { legacyEnumValue: roleDef.legacyEnumValue },
      });

      if (existing) {
        this.logger.debug(`Role "${roleDef.name}" already exists, skipping`);
        continue;
      }

      // Fetch permissions for this role
      const permissions: Permission[] = [];
      for (const permString of roleDef.permissions) {
        const [resource, action] = permString.split(':');
        const permission = await this.permissionRepository.findOne({
          where: { resource, action },
        });
        if (permission) {
          permissions.push(permission);
        }
      }

      // Create the role
      const role = this.roleRepository.create({
        name: roleDef.name,
        description: roleDef.description,
        organizationId: null, // System-wide role
        isSystemRole: true,
        legacyEnumValue: roleDef.legacyEnumValue,
        color: roleDef.color,
        sortOrder: roleDef.sortOrder,
        permissions,
        parentRoleId: null,
      });

      await this.roleRepository.save(role);
      this.logger.log(
        `Seeded system role "${roleDef.name}" with ${permissions.length} permissions`,
      );
    }
  }

  // ===========================================================================
  // PERMISSION CHECKING
  // ===========================================================================

  /**
   * Check if a role has a specific permission
   *
   * @param roleId - The role UUID
   * @param resource - Resource name (e.g., 'issue', 'project')
   * @param action - Action name (e.g., 'create', 'delete')
   * @returns true if the role has the permission
   */
  async hasPermission(
    roleId: string,
    resource: string,
    action: string,
  ): Promise<boolean> {
    const permissions = await this.getRolePermissions(roleId);
    return permissions.includes(`${resource}:${action}`);
  }

  /**
   * Check multiple permissions at once
   * Returns true if the role has ALL specified permissions
   */
  async hasAllPermissions(
    roleId: string,
    requiredPermissions: Array<{ resource: string; action: string }>,
  ): Promise<boolean> {
    const permissions = await this.getRolePermissions(roleId);
    return requiredPermissions.every((p) =>
      permissions.includes(`${p.resource}:${p.action}`),
    );
  }

  /**
   * Check if role has ANY of the specified permissions
   */
  async hasAnyPermission(
    roleId: string,
    requiredPermissions: Array<{ resource: string; action: string }>,
  ): Promise<boolean> {
    const permissions = await this.getRolePermissions(roleId);
    return requiredPermissions.some((p) =>
      permissions.includes(`${p.resource}:${p.action}`),
    );
  }

  // ===========================================================================
  // PERMISSION INHERITANCE (Phase 4)
  // ===========================================================================

  /**
   * Maximum depth for role inheritance hierarchy
   * Prevents infinite recursion in case of misconfigured circular references
   */
  private readonly MAX_INHERITANCE_DEPTH = 10;

  /**
   * Get all permissions for a role including inherited permissions from parent roles
   * Returns a flattened, deduplicated array of "resource:action" strings
   *
   * INHERITANCE LOGIC:
   * - Fetches role's direct permissions
   * - Recursively fetches parent role's permissions
   * - Merges and deduplicates all permissions
   * - Caches the final flattened result
   *
   * SAFETY:
   * - Max depth limit (10 levels) prevents stack overflow
   * - Cycle detection prevents infinite loops
   */
  async getRolePermissions(roleId: string): Promise<string[]> {
    // Check cache first - cache stores the FULL inherited permission set
    const cached = this.permissionCache.get(roleId);
    if (cached && cached.expiry > Date.now()) {
      return cached.permissions;
    }

    // Resolve permissions with inheritance (cycle detection via visited set)
    const visitedRoleIds = new Set<string>();
    const allPermissions = await this.resolvePermissionsRecursive(
      roleId,
      visitedRoleIds,
      0,
    );

    // Deduplicate using Set
    const uniquePermissions = [...new Set(allPermissions)];

    // Cache the flattened result
    this.permissionCache.set(roleId, {
      permissions: uniquePermissions,
      expiry: Date.now() + this.CACHE_TTL_MS,
    });

    return uniquePermissions;
  }

  /**
   * Recursively resolve permissions including inheritance from parent roles
   *
   * @param roleId - Role to resolve permissions for
   * @param visitedRoleIds - Set of already-visited role IDs (cycle detection)
   * @param depth - Current recursion depth
   * @returns Array of permission strings (may contain duplicates)
   */
  private async resolvePermissionsRecursive(
    roleId: string,
    visitedRoleIds: Set<string>,
    depth: number,
  ): Promise<string[]> {
    // Safety: Max depth limit
    if (depth > this.MAX_INHERITANCE_DEPTH) {
      this.logger.warn(
        `Max inheritance depth (${this.MAX_INHERITANCE_DEPTH}) exceeded for role ${roleId}. Stopping recursion.`,
      );
      return [];
    }

    // Safety: Cycle detection
    if (visitedRoleIds.has(roleId)) {
      this.logger.warn(
        `Circular role inheritance detected! Role ${roleId} already visited. Chain: ${[...visitedRoleIds].join(' → ')}`,
      );
      return [];
    }

    // Mark this role as visited
    visitedRoleIds.add(roleId);

    // Load role with parent relationship
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions', 'parentRole'],
    });

    if (!role) {
      this.logger.warn(
        `Role not found during inheritance resolution: ${roleId}`,
      );
      return [];
    }

    // Collect direct permissions
    const directPermissions = role.permissions.map(
      (p) => `${p.resource}:${p.action}`,
    );

    // If no parent, return just direct permissions
    if (!role.parentRole) {
      return directPermissions;
    }

    // Recursively get parent permissions
    const inheritedPermissions = await this.resolvePermissionsRecursive(
      role.parentRole.id,
      visitedRoleIds,
      depth + 1,
    );

    // Merge direct + inherited
    return [...directPermissions, ...inheritedPermissions];
  }

  /**
   * Invalidate cache for a role (call after permission changes)
   */
  invalidateRoleCache(roleId: string): void {
    this.permissionCache.delete(roleId);
  }

  // ===========================================================================
  // ROLE MANAGEMENT
  // ===========================================================================

  /**
   * Get role by legacy enum value (for backward compatibility)
   *
   * @param legacyEnumValue - The old ProjectRole enum value (e.g., 'ProjectLead')
   * @returns The matching Role entity
   */
  async getRoleByLegacyEnum(legacyEnumValue: string): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { legacyEnumValue },
      relations: ['permissions'],
    });
  }

  /**
   * Get all system-wide roles (for role selection dropdowns)
   */
  async getSystemRoles(): Promise<Role[]> {
    return this.roleRepository.find({
      where: { isSystemRole: true },
      order: { sortOrder: 'ASC' },
      relations: ['permissions'],
    });
  }

  /**
   * Get all roles for an organization (includes system roles + custom roles)
   */
  async getOrganizationRoles(organizationId: string): Promise<Role[]> {
    return this.roleRepository.find({
      where: [{ isSystemRole: true }, { organizationId }],
      order: { sortOrder: 'ASC' },
      relations: ['permissions'],
    });
  }

  /**
   * Get a single role by ID
   */
  async getRoleById(roleId: string): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException(`Role not found: ${roleId}`);
    }

    return role;
  }

  /**
   * Create a custom role for an organization
   *
   * @param actorId - User ID of the person creating the role (for audit)
   */
  async createCustomRole(
    organizationId: string,
    name: string,
    description: string,
    permissionIds: string[],
    actorId: string,
    color?: string,
  ): Promise<Role> {
    // Check if role name already exists in this org
    const existing = await this.roleRepository.findOne({
      where: { organizationId, name },
    });

    if (existing) {
      throw new ForbiddenException(
        `Role "${name}" already exists in this organization`,
      );
    }

    // Load permissions
    const permissions = await this.permissionRepository.find({
      where: { id: In(permissionIds) },
    });

    if (permissions.length !== permissionIds.length) {
      throw new NotFoundException('Some permissions were not found');
    }

    // Create the role
    const role = this.roleRepository.create({
      name,
      description,
      organizationId,
      isSystemRole: false,
      legacyEnumValue: null, // Custom roles have no legacy mapping
      permissions,
      color: color || '#6366f1',
      sortOrder: 100, // Custom roles after system roles
    });

    const savedRole = await this.roleRepository.save(role);

    // Audit: ROLE_CREATED
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: organizationId,
      actor_id: actorId,
      resource_type: 'Role',
      resource_id: savedRole.id,
      action_type: 'CREATE',
      metadata: {
        event: 'ROLE_CREATED',
        roleName: name,
        description,
        permissions: permissions.map((p) => `${p.resource}:${p.action}`),
        color: color || '#6366f1',
        isSystemRole: false,
      },
    });

    this.logger.log(
      `AUDIT: Role "${name}" created by ${actorId} in org ${organizationId}`,
    );

    return savedRole;
  }

  /**
   * Update a custom role's permissions
   * Note: Cannot modify system roles' core permissions
   *
   * @param actorId - User ID of the person updating the role (for audit)
   */
  async updateRolePermissions(
    roleId: string,
    permissionIds: string[],
    actorId: string,
  ): Promise<Role> {
    const role = await this.getRoleById(roleId);

    if (role.isSystemRole) {
      throw new ForbiddenException('Cannot modify permissions of system roles');
    }

    // Capture before state for audit
    const beforePermissions = role.permissions.map(
      (p) => `${p.resource}:${p.action}`,
    );

    // Load new permissions
    const newPermissions = await this.permissionRepository.find({
      where: { id: In(permissionIds) },
    });

    const afterPermissions = newPermissions.map(
      (p) => `${p.resource}:${p.action}`,
    );

    // Calculate added and removed permissions
    const added = afterPermissions.filter(
      (p) => !beforePermissions.includes(p),
    );
    const removed = beforePermissions.filter(
      (p) => !afterPermissions.includes(p),
    );

    role.permissions = newPermissions;
    this.invalidateRoleCache(roleId);

    const savedRole = await this.roleRepository.save(role);

    // Audit: ROLE_UPDATED
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: role.organizationId || 'system',
      actor_id: actorId,
      resource_type: 'Role',
      resource_id: roleId,
      action_type: 'UPDATE',
      changes: {
        permissions: [
          beforePermissions.join(', '),
          afterPermissions.join(', '),
        ],
      },
      metadata: {
        event: 'ROLE_UPDATED',
        roleName: role.name,
        permissionsAdded: added,
        permissionsRemoved: removed,
        totalPermissions: afterPermissions.length,
      },
    });

    this.logger.log(
      `AUDIT: Role "${role.name}" updated by ${actorId}. Added: ${added.length}, Removed: ${removed.length}`,
    );

    return savedRole;
  }

  /**
   * Delete a custom role
   * Note: Cannot delete system roles
   *
   * @param actorId - User ID of the person deleting the role (for audit)
   */
  async deleteRole(roleId: string, actorId: string): Promise<void> {
    const role = await this.getRoleById(roleId);

    if (role.isSystemRole) {
      throw new ForbiddenException('Cannot delete system roles');
    }

    // Check if any project members are using this role
    interface CountResult {
      count: string;
    }
    const membersUsingRole: CountResult[] = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM project_members WHERE "roleId" = $1`,
      [roleId],
    );

    const memberCount = parseInt(membersUsingRole[0]?.count ?? '0', 10);

    if (memberCount > 0) {
      throw new ForbiddenException(
        'Cannot delete role that is assigned to project members',
      );
    }

    // Capture role details before deletion for audit
    const roleDetails = {
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((p) => `${p.resource}:${p.action}`),
      organizationId: role.organizationId,
    };

    await this.roleRepository.remove(role);
    this.invalidateRoleCache(roleId);

    // Audit: ROLE_DELETED
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: role.organizationId || 'system',
      actor_id: actorId,
      resource_type: 'Role',
      resource_id: roleId,
      action_type: 'DELETE',
      metadata: {
        event: 'ROLE_DELETED',
        roleName: roleDetails.name,
        description: roleDetails.description,
        permissionsAtDeletion: roleDetails.permissions,
        memberCountAtDeletion: memberCount,
      },
    });

    this.logger.log(
      `AUDIT: Role "${roleDetails.name}" deleted by ${actorId} from org ${roleDetails.organizationId}`,
    );
  }

  // ===========================================================================
  // PERMISSION MANAGEMENT
  // ===========================================================================

  /**
   * Get all available permissions (for role configuration UI)
   */
  async getAllPermissions(): Promise<Permission[]> {
    return this.permissionRepository.find({
      order: { resource: 'ASC', action: 'ASC' },
    });
  }

  /**
   * Get permissions grouped by resource (for UI display)
   */
  async getPermissionsGroupedByResource(): Promise<
    Record<string, Permission[]>
  > {
    const permissions = await this.getAllPermissions();

    return permissions.reduce(
      (acc, permission) => {
        if (!acc[permission.resource]) {
          acc[permission.resource] = [];
        }
        acc[permission.resource].push(permission);
        return acc;
      },
      {} as Record<string, Permission[]>,
    );
  }
}

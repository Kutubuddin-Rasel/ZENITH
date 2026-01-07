import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';

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
 */
@Injectable()
export class RBACService {
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
  ) {}

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

  /**
   * Get all permissions for a role (with caching)
   * Returns array of "resource:action" strings
   */
  async getRolePermissions(roleId: string): Promise<string[]> {
    // Check cache first
    const cached = this.permissionCache.get(roleId);
    if (cached && cached.expiry > Date.now()) {
      return cached.permissions;
    }

    // Load from database
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });

    if (!role) {
      this.logger.warn(`Role not found: ${roleId}`);
      return [];
    }

    const permissions = role.permissions.map(
      (p) => `${p.resource}:${p.action}`,
    );

    // Cache the result
    this.permissionCache.set(roleId, {
      permissions,
      expiry: Date.now() + this.CACHE_TTL_MS,
    });

    return permissions;
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
   */
  async createCustomRole(
    organizationId: string,
    name: string,
    description: string,
    permissionIds: string[],
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

    return this.roleRepository.save(role);
  }

  /**
   * Update a custom role's permissions
   * Note: Cannot modify system roles' core permissions
   */
  async updateRolePermissions(
    roleId: string,
    permissionIds: string[],
  ): Promise<Role> {
    const role = await this.getRoleById(roleId);

    if (role.isSystemRole) {
      throw new ForbiddenException('Cannot modify permissions of system roles');
    }

    // Load permissions
    const permissions = await this.permissionRepository.find({
      where: { id: In(permissionIds) },
    });

    role.permissions = permissions;
    this.invalidateRoleCache(roleId);

    return this.roleRepository.save(role);
  }

  /**
   * Delete a custom role
   * Note: Cannot delete system roles
   */
  async deleteRole(roleId: string): Promise<void> {
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

    if (parseInt(membersUsingRole[0]?.count ?? '0', 10) > 0) {
      throw new ForbiddenException(
        'Cannot delete role that is assigned to project members',
      );
    }

    await this.roleRepository.remove(role);
    this.invalidateRoleCache(roleId);
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

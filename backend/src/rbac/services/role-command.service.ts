import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AbstractPermissionRepository } from '../repositories/abstract/permission.repository.abstract';
import { AbstractRoleRepository } from '../repositories/abstract/role.repository.abstract';
import { diffPermissionKeys, toPermissionKeys } from '../domain/role.domain';
import { toRoleDetails } from '../domain/rbac.mappers';
import {
  MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN,
  RBAC_AUDIT_EMITTER_TOKEN,
  RBAC_PERMISSION_CACHE_TOKEN,
} from '../constants/rbac.tokens';
import type {
  CreateRoleCommand,
  DeleteRoleCommand,
  IPermissionCacheStore,
  IRoleCommandService,
  RoleDetails,
  UpdateRolePermissionsCommand,
} from '../interfaces/rbac.interfaces';
import type {
  IAuditEmitterPort,
  IMembershipRoleUsageProbe,
} from '../ports/rbac.ports';
import { Role } from '../entities/role.entity';

/**
 * RoleCommandService
 *
 * Write-side surface for role administration. Talks ONLY to:
 *  - the abstract role / permission repositories (DIP),
 *  - the permission cache port (invalidation on every mutation),
 *  - the audit emitter port (`IAuditEmitterPort` — bound to a temporary
 *    adapter today; Step 4 swaps for the canonical audit module
 *    adapter),
 *  - the membership role-usage probe port (`IMembershipRoleUsageProbe`
 *    — bound to a temporary adapter today; Step 4 swaps for the
 *    membership-owned adapter).
 *
 * No raw SQL, no concrete cross-module imports. The class is small
 * enough to read in one screen.
 */
@Injectable()
export class RoleCommandService implements IRoleCommandService {
  private readonly logger = new Logger(RoleCommandService.name);

  constructor(
    private readonly roleRepository: AbstractRoleRepository,
    private readonly permissionRepository: AbstractPermissionRepository,
    @Inject(RBAC_PERMISSION_CACHE_TOKEN)
    private readonly cache: IPermissionCacheStore,
    @Inject(RBAC_AUDIT_EMITTER_TOKEN)
    private readonly audit: IAuditEmitterPort,
    @Inject(MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN)
    private readonly membershipProbe: IMembershipRoleUsageProbe,
  ) {}

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async createCustomRole(command: CreateRoleCommand): Promise<RoleDetails> {
    const existing = await this.roleRepository.findByOrganizationAndName(
      command.organizationId,
      command.name,
    );
    if (existing) {
      throw new ForbiddenException(
        `Role "${command.name}" already exists in this organization`,
      );
    }

    const permissions = await this.permissionRepository.findByIds(
      command.permissionIds,
    );
    if (permissions.length !== command.permissionIds.length) {
      throw new NotFoundException('Some permissions were not found');
    }

    const created = await this.roleRepository.create({
      name: command.name,
      description: command.description ?? null,
      organizationId: command.organizationId,
      isSystemRole: false,
      legacyEnumValue: null,
      color: command.color ?? '#6366f1',
      sortOrder: command.sortOrder ?? 100,
      parentRoleId: command.parentRoleId ?? null,
      permissions,
    });

    await this.audit.emit({
      action: 'rbac.role.created',
      actorId: command.createdBy,
      organizationId: command.organizationId,
      roleId: created.id,
      occurredAt: new Date(),
      metadata: {
        roleName: command.name,
        description: command.description ?? null,
        permissions: toPermissionKeys(permissions),
        color: command.color ?? '#6366f1',
        isSystemRole: false,
      },
    });

    this.logger.log(
      `Role "${command.name}" created by ${command.createdBy} in org ${command.organizationId}`,
    );

    return toRoleDetails(created);
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  async updateRolePermissions(
    command: UpdateRolePermissionsCommand,
  ): Promise<RoleDetails> {
    const role = await this.loadRoleOrThrow(command.roleId);

    if (role.isSystemRole) {
      throw new ForbiddenException('Cannot modify permissions of system roles');
    }

    const beforePermissions = toPermissionKeys(role.permissions);
    const newPermissions = await this.permissionRepository.findByIds(
      command.permissionIds,
    );
    const afterPermissions = toPermissionKeys(newPermissions);
    const { added, removed } = diffPermissionKeys(
      beforePermissions,
      afterPermissions,
    );

    await this.cache.invalidate(command.roleId);
    const saved = await this.roleRepository.replacePermissions(
      role,
      newPermissions,
    );

    await this.audit.emit({
      action: 'rbac.role.permissions_updated',
      actorId: command.updatedBy,
      organizationId: role.organizationId,
      roleId: role.id,
      occurredAt: new Date(),
      metadata: {
        roleName: role.name,
        beforePermissions,
        afterPermissions,
        permissionsAdded: [...added],
        permissionsRemoved: [...removed],
        totalPermissions: afterPermissions.length,
      },
    });

    this.logger.log(
      `Role "${role.name}" updated by ${command.updatedBy}. Added: ${added.length}, Removed: ${removed.length}`,
    );

    return toRoleDetails(saved);
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  async deleteRole(command: DeleteRoleCommand): Promise<void> {
    const role = await this.loadRoleOrThrow(command.roleId);

    if (role.isSystemRole) {
      throw new ForbiddenException('Cannot delete system roles');
    }

    const usage = await this.membershipProbe.report(command.roleId);
    if (usage.inUse) {
      throw new ForbiddenException(
        'Cannot delete role that is assigned to project members',
      );
    }

    const snapshot = {
      name: role.name,
      description: role.description,
      permissions: toPermissionKeys(role.permissions),
      organizationId: role.organizationId,
    };

    await this.roleRepository.remove(role);
    await this.cache.invalidate(command.roleId);

    await this.audit.emit({
      action: 'rbac.role.deleted',
      actorId: command.deletedBy,
      organizationId: role.organizationId,
      roleId: command.roleId,
      occurredAt: new Date(),
      metadata: {
        roleName: snapshot.name,
        description: snapshot.description,
        permissionsAtDeletion: snapshot.permissions,
        memberCountAtDeletion: usage.assignmentCount,
      },
    });

    this.logger.log(
      `Role "${snapshot.name}" deleted by ${command.deletedBy} from org ${snapshot.organizationId ?? 'system'}`,
    );
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async loadRoleOrThrow(roleId: string): Promise<Role> {
    const role = await this.roleRepository.findByIdWithPermissions(roleId);
    if (!role) {
      throw new NotFoundException(`Role not found: ${roleId}`);
    }
    return role;
  }
}

import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import type {
  PermissionDescriptor,
  RoleDetails,
  RoleSummary,
} from '../interfaces/rbac.interfaces';
import { permissionKey } from './role.domain';

/**
 * Entity → DTO mappers
 *
 * These are the SINGLE entity-boundary inside the RBAC module. Every
 * service that returns a value through an ISP contract
 * (`IRoleQueryService`, `IPermissionQueryService`, …) routes its
 * persistence result through one of these mappers so external consumers
 * never see a TypeORM entity.
 */

export function toPermissionDescriptor(p: Permission): PermissionDescriptor {
  return {
    id: p.id,
    resource: p.resource,
    action: p.action,
    description: p.description,
    displayName: p.displayName,
    key: permissionKey(p),
  };
}

export function toRoleSummary(role: Role): RoleSummary {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    organizationId: role.organizationId,
    isSystemRole: role.isSystemRole,
    legacyEnumValue: role.legacyEnumValue,
    color: role.color,
    sortOrder: role.sortOrder,
    parentRoleId: role.parentRoleId,
  };
}

export function toRoleDetails(role: Role): RoleDetails {
  return {
    ...toRoleSummary(role),
    permissions: (role.permissions ?? []).map(toPermissionDescriptor),
  };
}

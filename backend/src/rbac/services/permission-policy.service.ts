import { Inject, Injectable } from '@nestjs/common';
import { permissionKey } from '../domain/role.domain';
import {
  RBAC_PERMISSION_CACHE_TOKEN,
  RBAC_ROLE_HIERARCHY_TOKEN,
} from '../constants/rbac.tokens';
import type {
  IPermissionCacheStore,
  IPermissionPolicyService,
  IRoleHierarchyResolver,
} from '../interfaces/rbac.interfaces';

/**
 * PermissionPolicyService
 *
 * Narrow, hot-path authorization surface. Every guard, CASL ability, and
 * cross-cutting consumer (circuit-breaker, scheduled jobs) goes through
 * this service — never through the role CRUD surface.
 *
 * The service composes two collaborators that are themselves bound
 * behind ISP tokens:
 *  - `IRoleHierarchyResolver` — pure inheritance walk.
 *  - `IPermissionCacheStore`  — Redis-backed, cross-pod safe.
 */
@Injectable()
export class PermissionPolicyService implements IPermissionPolicyService {
  constructor(
    @Inject(RBAC_ROLE_HIERARCHY_TOKEN)
    private readonly hierarchy: IRoleHierarchyResolver,
    @Inject(RBAC_PERMISSION_CACHE_TOKEN)
    private readonly cache: IPermissionCacheStore,
  ) {}

  async resolveRolePermissions(roleId: string): Promise<readonly string[]> {
    const cached = await this.cache.get(roleId);
    if (cached) {
      return cached;
    }

    const resolved = await this.hierarchy.resolveInheritedPermissions(roleId);
    await this.cache.set(roleId, resolved);
    return resolved;
  }

  async hasPermission(
    roleId: string,
    resource: string,
    action: string,
  ): Promise<boolean> {
    const permissions = await this.resolveRolePermissions(roleId);
    return permissions.includes(permissionKey({ resource, action }));
  }

  async hasAllPermissions(
    roleId: string,
    permissionKeys: readonly string[],
  ): Promise<boolean> {
    if (permissionKeys.length === 0) {
      return true;
    }
    const permissions = await this.resolveRolePermissions(roleId);
    const granted = new Set(permissions);
    return permissionKeys.every((k) => granted.has(k));
  }

  async hasAnyPermission(
    roleId: string,
    permissionKeys: readonly string[],
  ): Promise<boolean> {
    if (permissionKeys.length === 0) {
      return false;
    }
    const permissions = await this.resolveRolePermissions(roleId);
    const granted = new Set(permissions);
    return permissionKeys.some((k) => granted.has(k));
  }
}

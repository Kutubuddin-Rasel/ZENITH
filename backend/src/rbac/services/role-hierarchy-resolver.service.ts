import { Injectable, Logger } from '@nestjs/common';
import { AbstractRoleRepository } from '../repositories/abstract/role.repository.abstract';
import { toPermissionKeys } from '../domain/role.domain';
import type { IRoleHierarchyResolver } from '../interfaces/rbac.interfaces';

const MAX_INHERITANCE_DEPTH = 10;

/**
 * RoleHierarchyResolver
 *
 * Pure algorithmic recursion over the role inheritance graph. Has ONLY
 * one collaborator — the role repository — and emits no side effects.
 * Cycle detection and depth limiting are enforced before any persistence
 * read, so a misconfigured hierarchy cannot stall the worker.
 */
@Injectable()
export class RoleHierarchyResolverService implements IRoleHierarchyResolver {
  private readonly logger = new Logger(RoleHierarchyResolverService.name);

  constructor(private readonly roleRepository: AbstractRoleRepository) {}

  async resolveInheritedPermissions(
    roleId: string,
  ): Promise<readonly string[]> {
    const visited = new Set<string>();
    const collected = await this.walk(roleId, visited, 0);
    return [...new Set(collected)];
  }

  async wouldIntroduceCycle(
    childRoleId: string,
    candidateParentRoleId: string,
  ): Promise<boolean> {
    if (childRoleId === candidateParentRoleId) {
      return true;
    }

    let cursorId: string | null = candidateParentRoleId;
    const visited = new Set<string>();
    let depth = 0;

    while (cursorId !== null) {
      if (cursorId === childRoleId) {
        return true;
      }
      if (visited.has(cursorId) || depth > MAX_INHERITANCE_DEPTH) {
        // The existing chain itself is malformed — refuse to attach to it.
        return true;
      }
      visited.add(cursorId);

      const parent: { parentRoleId: string | null } | null =
        await this.roleRepository.findById(cursorId);
      cursorId = parent?.parentRoleId ?? null;
      depth += 1;
    }

    return false;
  }

  private async walk(
    roleId: string,
    visited: Set<string>,
    depth: number,
  ): Promise<string[]> {
    if (depth > MAX_INHERITANCE_DEPTH) {
      this.logger.warn(
        `Max inheritance depth (${MAX_INHERITANCE_DEPTH}) exceeded for role ${roleId}. Stopping recursion.`,
      );
      return [];
    }

    if (visited.has(roleId)) {
      this.logger.warn(
        `Circular role inheritance detected at role ${roleId}. Chain: ${[...visited].join(' → ')}`,
      );
      return [];
    }
    visited.add(roleId);

    const role =
      await this.roleRepository.findByIdWithPermissionsAndParent(roleId);

    if (!role) {
      this.logger.warn(
        `Role not found during inheritance resolution: ${roleId}`,
      );
      return [];
    }

    const direct = toPermissionKeys(role.permissions);
    if (!role.parentRole) {
      return direct;
    }

    const inherited = await this.walk(role.parentRole.id, visited, depth + 1);
    return [...direct, ...inherited];
  }
}

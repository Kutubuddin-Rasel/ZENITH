import { Injectable } from '@nestjs/common';
import type { IPermissionChecker } from '../../circuit-breaker/interfaces/circuit-breaker.interfaces';
import { RBACService } from '../rbac.service';

/**
 * RbacPermissionCheckerAdapter
 *
 * Satisfies the abstract `IPermissionChecker` contract for the
 * circuit-breaker module. Lives in the rbac module — the rightful owner
 * of permission resolution — so the breaker carries no upward dependency
 * on a concrete RBAC implementation.
 *
 * The `principalId` parameter is interpreted as a role id here; that
 * mapping is an implementation detail of this adapter, never a contract
 * leak.
 */
@Injectable()
export class RbacPermissionCheckerAdapter implements IPermissionChecker {
  constructor(private readonly rbacService: RBACService) {}

  async hasPermission(
    principalId: string,
    permission: string,
  ): Promise<boolean> {
    const permissions = await this.rbacService.getRolePermissions(principalId);
    return permissions.includes(permission);
  }
}

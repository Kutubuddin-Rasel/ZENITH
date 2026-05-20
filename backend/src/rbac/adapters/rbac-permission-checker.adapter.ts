import { Inject, Injectable } from '@nestjs/common';
import type { IPermissionChecker } from '../../circuit-breaker/interfaces/circuit-breaker.interfaces';
import { RBAC_PERMISSION_POLICY_TOKEN } from '../constants/rbac.tokens';
import type { IPermissionPolicyService } from '../interfaces/rbac.interfaces';

/**
 * RbacPermissionCheckerAdapter
 *
 * Satisfies the abstract `IPermissionChecker` contract for the
 * circuit-breaker module. Lives in the RBAC module — the rightful owner
 * of permission resolution — so the breaker carries no upward dependency
 * on a concrete RBAC implementation.
 *
 * Since Step 3 of the RBAC refactor this adapter consumes the narrow
 * `IPermissionPolicyService` surface via `RBAC_PERMISSION_POLICY_TOKEN`
 * rather than the (now-deleted) god-class. The `principalId` parameter
 * is interpreted as a role id here; that mapping is an implementation
 * detail of this adapter, never a contract leak.
 */
@Injectable()
export class RbacPermissionCheckerAdapter implements IPermissionChecker {
  constructor(
    @Inject(RBAC_PERMISSION_POLICY_TOKEN)
    private readonly policy: IPermissionPolicyService,
  ) {}

  async hasPermission(
    principalId: string,
    permission: string,
  ): Promise<boolean> {
    const permissions = await this.policy.resolveRolePermissions(principalId);
    return permissions.includes(permission);
  }
}

import { Injectable } from '@nestjs/common';
import type { IMembershipRoleUsageProbe, RoleUsageReport } from '../../rbac';
import { AbstractProjectMemberRepository } from '../repositories/abstract/project-member.repository.abstract';

/**
 * MembershipRoleUsageProbeAdapter
 *
 * Canonical implementation of the RBAC outbound membership-usage port
 * (`IMembershipRoleUsageProbe`). Lives inside the membership module —
 * the rightful owner of the `project_members` aggregate — so RBAC never
 * issues raw SQL against a table outside its own boundary.
 *
 * Step 2 — Repository Inversion
 * -----------------------------
 * Direct `Repository<ProjectMember>` injection was replaced with the
 * abstract repository so this adapter no longer pierces the DIP
 * boundary. All persistence access happens through
 * `AbstractProjectMemberRepository.countByRoleId(roleId)`.
 *
 * Bound to `MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN` inside `MembershipModule`
 * and re-exported so the (also `@Global()`) RBAC module receives the
 * binding through a normal `imports: [MembershipModule]` edge.
 */
@Injectable()
export class MembershipRoleUsageProbeAdapter implements IMembershipRoleUsageProbe {
  constructor(
    private readonly projectMemberRepo: AbstractProjectMemberRepository,
  ) {}

  async countAssignments(roleId: string): Promise<number> {
    return this.projectMemberRepo.countByRoleId(roleId);
  }

  async isInUse(roleId: string): Promise<boolean> {
    return (await this.countAssignments(roleId)) > 0;
  }

  async report(roleId: string): Promise<RoleUsageReport> {
    const assignmentCount = await this.countAssignments(roleId);
    return {
      roleId,
      assignmentCount,
      inUse: assignmentCount > 0,
    };
  }
}

import { ForbiddenException, Injectable } from '@nestjs/common';
import { ProjectRole } from '../enums/project-role.enum';
import { IProjectMemberPolicy } from '../interfaces/membership.interfaces';

/**
 * ProjectMemberPolicyService
 *
 * Pure, in-process implementation of `IProjectMemberPolicy`. Centralises
 * role-hierarchy enforcement so every mutation path (Command service,
 * controller pre-checks, future invite/orchestrator flows) consults a
 * single decision surface instead of reimplementing the weight map.
 *
 * Bound to `PROJECT_MEMBER_POLICY_TOKEN` inside `MembershipModule`.
 *
 * Weight rationale
 * ----------------
 * The legacy `ProjectRole` enum (`roleName`) is the hierarchy key — not
 * the dynamic-RBAC `roleId` — because `roleName` is populated on every
 * `ProjectMember` row, whereas `roleId` is nullable during the
 * dynamic-RBAC migration window. Once roleId backfill is complete this
 * service is the single chokepoint to swap in database-backed
 * inheritance (the interface stays asynchronous to leave that door
 * open).
 *
 *   ProjectLead (10) — full project authority
 *   QA           (8) — quality + issue management
 *   Developer    (7) — issue / sprint / board CRUD
 *   Designer     (6) — design-scope issues
 *   Member       (5) — legacy general member
 *   Viewer       (3) — read-only
 *   Guest        (1) — limited read-only
 */
const ROLE_WEIGHT: Readonly<Record<ProjectRole, number>> = {
  [ProjectRole.PROJECT_LEAD]: 10,
  [ProjectRole.QA]: 8,
  [ProjectRole.DEVELOPER]: 7,
  [ProjectRole.DESIGNER]: 6,
  [ProjectRole.MEMBER]: 5,
  [ProjectRole.VIEWER]: 3,
  [ProjectRole.GUEST]: 1,
} as const;

@Injectable()
export class ProjectMemberPolicyService implements IProjectMemberPolicy {
  canManageRole(actorRole: ProjectRole, targetRole: ProjectRole): boolean {
    return ROLE_WEIGHT[actorRole] >= ROLE_WEIGHT[targetRole];
  }

  assertCanManageRole(actorRole: ProjectRole, targetRole: ProjectRole): void {
    if (!this.canManageRole(actorRole, targetRole)) {
      throw new ForbiddenException(
        `Cannot assign role '${targetRole}' — your role '${actorRole}' does not have sufficient authority`,
      );
    }
  }
}

import { Injectable } from '@nestjs/common';
import { AbstractProjectMemberRepository } from '../repositories/abstract/project-member.repository.abstract';
import {
  IProjectMemberQuery,
  ProjectMemberRoleDetails,
  ProjectMemberWithUser,
  UserMembership,
} from '../interfaces/membership.interfaces';
import { ProjectRole } from '../enums/project-role.enum';

/**
 * ProjectMemberQueryService
 *
 * Read-only implementation of `IProjectMemberQuery`. Bound to
 * `PROJECT_MEMBER_QUERY_TOKEN` so every external consumer (guards,
 * domain services, scheduled-report processor) reads through this
 * ISP-segregated surface instead of touching `Repository<ProjectMember>`
 * or the (soon-to-be-deleted) legacy god-class.
 *
 * Step 2 scope
 * ------------
 * Introduced early so the persistence boundary is sealed against ALL
 * `@InjectRepository(ProjectMember)` violations — including the one in
 * `reports/processors/scheduled-reports.processor.ts`. The companion
 * write-side and policy services land in Step 3; the legacy
 * `ProjectMembersService` remains live until Step 4 finishes the
 * consumer migration.
 *
 * DTO Mapping
 * -----------
 * The repository returns the `ProjectMember` entity (the canonical
 * aggregate shape inside the module). This service maps to pure
 * value-object DTOs so consumers never accidentally depend on ORM
 * metadata, lifecycle decorators, or relation hydration semantics.
 */
@Injectable()
export class ProjectMemberQueryService implements IProjectMemberQuery {
  constructor(private readonly repository: AbstractProjectMemberRepository) {}

  async listMembers(
    projectId: string,
  ): Promise<readonly ProjectMemberWithUser[]> {
    const members = await this.repository.listByProjectWithUser(projectId);
    return members.map((pm) => ({
      projectId: pm.projectId,
      userId: pm.userId,
      roleName: pm.roleName,
      user: {
        id: pm.user.id,
        name: pm.user.name,
        email: pm.user.email,
        defaultRole: pm.user.defaultRole,
      },
    }));
  }

  async getUserRole(
    projectId: string,
    userId: string,
  ): Promise<ProjectRole | null> {
    const pm = await this.repository.findOne(projectId, userId);
    return pm?.roleName ?? null;
  }

  async getMemberRoleDetails(
    projectId: string,
    userId: string,
  ): Promise<ProjectMemberRoleDetails | null> {
    const pm = await this.repository.findOne(projectId, userId);
    if (!pm) return null;
    return { roleId: pm.roleId, roleName: pm.roleName };
  }

  async listMembershipsForUser(
    userId: string,
  ): Promise<readonly UserMembership[]> {
    const memberships = await this.repository.findByUser(userId);
    return memberships.map((pm) => ({
      projectId: pm.projectId,
      roleName: pm.roleName,
    }));
  }
}

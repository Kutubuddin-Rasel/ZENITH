import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { AbstractSprintSnapshotRepository } from '../repositories/abstract/sprint-snapshot.repository.abstract';
import { ProjectLookupPort } from '../ports/project-lookup.port';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import type { IssueView } from '../../issues';
import type {
  ISprintQuery,
  SprintSnapshotView,
  SprintView,
} from '../interfaces/sprints.interfaces';

/**
 * SprintQueryService — the read face of the sprints aggregate
 * (`SPRINT_QUERY_TOKEN`).
 *
 * Read-side tenant isolation lives here, not on a guard: `findAll`
 * gates on an org-scoped project existence check (`ProjectLookupPort`)
 * and the per-sprint reads gate on project membership
 * (`IProjectMemberQuery`). Methods return the raw entities typed as the
 * relation-free `SprintView` / `SprintSnapshotView` / `IssueView`
 * projections — consumers can never compile against the ORM relations.
 */
@Injectable()
export class SprintQueryService implements ISprintQuery {
  constructor(
    private readonly sprintRepo: AbstractSprintRepository,
    private readonly snapshotRepo: AbstractSprintSnapshotRepository,
    private readonly projectLookup: ProjectLookupPort,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly members: IProjectMemberQuery,
  ) {}

  async findAll(
    projectId: string,
    _userId: string,
    active?: boolean,
  ): Promise<readonly SprintView[]> {
    const exists = await this.projectLookup.existsForTenant(projectId);
    if (!exists) throw new NotFoundException('Project not found');
    return this.sprintRepo.findAllInProject(projectId, active);
  }

  async findOne(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<SprintView> {
    const sprint = await this.sprintRepo.findDetailById(projectId, sprintId);
    if (!sprint) throw new NotFoundException('Sprint not found');

    const role = await this.members.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
    return sprint;
  }

  async getSprintIssues(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<readonly IssueView[]> {
    const role = await this.members.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');

    const sprintIssues =
      await this.sprintRepo.findSprintIssuesOrdered(sprintId);
    return sprintIssues.map((si) => si.issue);
  }

  getSprintSnapshots(sprintId: string): Promise<readonly SprintSnapshotView[]> {
    return this.snapshotRepo.findBySprintOrdered(sprintId);
  }
}

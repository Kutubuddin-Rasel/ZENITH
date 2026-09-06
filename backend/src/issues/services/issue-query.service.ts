import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { IssueRepository } from '../../database/repositories/issue.repository';
import { IssueLinkRepository } from '../../database/repositories/issue-link.repository';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';

import { Issue, IssueStatus } from '../entities/issue.entity';
import { IssueLink } from '../entities/issue-link.entity';
import type { IIssueQuery, IssueFilter } from '../interfaces/issues.interfaces';
import { IssueAuthzService } from './issue-authz.service';
import { IssueKeyService } from './issue-key.service';

/**
 * IssueQueryService — read side of the issues aggregate.
 *
 * Bound to `ISSUE_QUERY_TOKEN`. Pure code-motion of the legacy
 * `IssuesService` read methods; behavior (caching, tenant guard,
 * membership 403 strings) preserved verbatim. Returns the `Issue` /
 * `IssueLink` entities rather than the narrower view DTOs — covariance
 * satisfies `IIssueQuery` and keeps binary compatibility with the
 * legacy callers during the multi-step strangler migration (Step 4
 * narrows once every consumer is on the token path).
 */
@Injectable()
export class IssueQueryService implements IIssueQuery {
  constructor(
    private readonly issueRepo: IssueRepository,
    private readonly issueLinkRepo: IssueLinkRepository,
    private readonly projects: ProjectRepository,
    private readonly authz: IssueAuthzService,
    private readonly keyService: IssueKeyService,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly projectMembersService: IProjectMemberQuery,
  ) {}

  /** List issues (no notification). */
  async findAll(
    projectId: string,
    userId: string,
    filters?: IssueFilter,
  ): Promise<Issue[]> {
    // TENANT ISOLATION: auto-filters by the caller's organizationId.
    const project = await this.keyService.findTenantProject(projectId);
    if (!project) throw new NotFoundException('Project not found');

    return this.issueRepo.findFilteredByProject(
      projectId,
      filters as {
        status?: IssueStatus;
        assigneeId?: string;
        search?: string;
        label?: string;
        sprint?: string;
        sort?: string;
        includeArchived?: boolean;
        type?: string;
      },
    );
  }

  /** Get one issue (cache-through, tenant + membership guarded). */
  async findOne(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Issue> {
    const cacheKey = `issue:${issueId} `;
    const cachedIssue = await this.cacheStore.get<Issue>(cacheKey);

    if (cachedIssue) {
      if (cachedIssue.projectId !== projectId) {
        throw new NotFoundException('Issue not found in this project');
      }
      if (
        organizationId &&
        cachedIssue.project?.organizationId !== organizationId
      ) {
        throw new NotFoundException('Issue not found in this project');
      }

      // Membership may have changed since the issue was cached.
      const role = await this.projectMembersService.getUserRole(
        projectId,
        userId,
      );
      if (!role) {
        throw new ForbiddenException('You are not a member of this project');
      }

      return cachedIssue;
    }

    const issue = await this.issueRepo.findOne({
      where: { id: issueId, projectId },
      relations: ['parent', 'children', 'assignee', 'reporter', 'project'],
    });
    if (!issue) {
      throw new NotFoundException('Issue not found in this project');
    }

    if (organizationId && issue.project.organizationId !== organizationId) {
      throw new NotFoundException('Issue not found in this project');
    }

    const role = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );
    if (!role) {
      throw new ForbiddenException('You are not a member of this project');
    }

    await this.cacheStore.set(cacheKey, issue, {
      ttl: 900, // 15 minutes
      tags: [`issue:${issueId} `, `project:${projectId}: issues`],
    });

    return issue;
  }

  /** Get links for an issue (both directions). */
  async getLinks(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<IssueLink[]> {
    await this.findOne(projectId, issueId, userId);
    return this.issueLinkRepo.findForIssue(issueId);
  }

  /** Stream issues for CSV export. */
  async getIssuesStream(
    projectId: string,
    userId: string,
    organizationId?: string,
  ): Promise<NodeJS.ReadableStream> {
    if (organizationId) {
      const project = await this.projects.findOne({
        where: { id: projectId, organizationId },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    await this.authz.requireMember(projectId, userId);
    return this.issueRepo.streamForExport(projectId);
  }
}

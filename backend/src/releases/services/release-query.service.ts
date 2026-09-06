// src/releases/services/release-query.service.ts
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PROJECT_QUERY_TOKEN, type IProjectQuery } from '../../projects';
import { PROJECT_MEMBER_QUERY_TOKEN } from 'src/membership/constants/membership.tokens';
import type { IProjectMemberQuery } from 'src/membership/interfaces/membership.interfaces';
import { RELEASE_REPOSITORY_TOKEN } from '../constants/releases.tokens';
import type {
  IReleaseQuery,
  IReleaseRepository,
  ReleaseComparison,
  ReleaseGitInfo,
  ReleaseListCriteria,
  VersionSuggestion,
} from '../interfaces/releases.interfaces';
import type { Release } from '../entities/release.entity';
import type { ReleaseAttachment } from '../entities/release-attachment.entity';
import type { Issue } from '../../issues/entities/issue.entity';
import {
  PAGINATION_DEFAULTS,
  PaginatedReleasesQueryDto,
  ReleaseSortField,
} from '../dto/paginated-releases-query.dto';
import {
  PaginatedResponse,
  createPaginatedResponse,
} from '../dto/paginated-response.dto';
import {
  bumpVersion,
  formatVersion,
  maxVersionName,
  parseVersion,
} from '../utils/semver.util';

/**
 * Release read surface (RELEASE_QUERY_TOKEN). Pure reads + read-side tenant
 * isolation (project-membership gate). Owns NO TypeORM — all persistence is
 * delegated to `IReleaseRepository`, keeping QueryBuilders out of the service
 * (SRP). Semver math is delegated to the pure `semver.util`.
 */
@Injectable()
export class ReleaseQueryService implements IReleaseQuery {
  constructor(
    @Inject(RELEASE_REPOSITORY_TOKEN)
    private readonly repo: IReleaseRepository,
    @Inject(PROJECT_QUERY_TOKEN)
    private readonly projectsQuery: IProjectQuery,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly membersService: IProjectMemberQuery,
  ) {}

  /** Assert the caller is a member of the project (any role). */
  private async assertMember(projectId: string, userId: string): Promise<void> {
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
  }

  async findOne(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Release> {
    const rel = await this.repo.findReleaseDetail(projectId, releaseId);
    if (!rel) throw new NotFoundException('Release not found');
    await this.assertMember(projectId, userId);
    return rel;
  }

  /** @deprecated unpaginated list — prefer `findAllPaginated`. */
  async findAll(projectId: string, userId: string): Promise<Release[]> {
    await this.projectsQuery.findById(projectId);
    await this.assertMember(projectId, userId);
    return this.repo.findAllReleases(projectId);
  }

  async findAllPaginated(
    projectId: string,
    userId: string,
    query: PaginatedReleasesQueryDto,
  ): Promise<PaginatedResponse<Release>> {
    await this.projectsQuery.findById(projectId);
    await this.assertMember(projectId, userId);

    const page = query.page ?? PAGINATION_DEFAULTS.PAGE;
    const limit = query.limit ?? PAGINATION_DEFAULTS.LIMIT;
    const criteria: ReleaseListCriteria = {
      status: query.status,
      search: query.search,
      sortBy: query.sortBy ?? ReleaseSortField.CREATED_AT,
      sortOrder: query.sortOrder ?? 'DESC',
      skip: (page - 1) * limit,
      take: limit,
    };

    const [data, total] = await this.repo.findReleasesPaginated(
      projectId,
      criteria,
    );
    return createPaginatedResponse(data, page, limit, total);
  }

  async getIssues(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Issue[]> {
    await this.findOne(projectId, releaseId, userId);
    const links = await this.repo.findLinksByRelease(releaseId);
    return links.map((link) => link.issue);
  }

  async getAttachments(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<ReleaseAttachment[]> {
    await this.findOne(projectId, releaseId, userId);
    return this.repo.findAttachmentsByRelease(releaseId);
  }

  async getGitInfo(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<ReleaseGitInfo> {
    const rel = await this.findOne(projectId, releaseId, userId);
    return {
      gitTagName: rel.gitTagName,
      gitBranch: rel.gitBranch,
      commitSha: rel.commitSha,
      gitProvider: rel.gitProvider,
      gitRepoUrl: rel.gitRepoUrl,
    };
  }

  async compareReleases(
    projectId: string,
    releaseId1: string,
    releaseId2: string,
    userId: string,
  ): Promise<ReleaseComparison> {
    // Membership gate + detail load for both releases, in parallel.
    const [rel1, rel2] = await Promise.all([
      this.findOne(projectId, releaseId1, userId),
      this.findOne(projectId, releaseId2, userId),
    ]);
    // Issue links loaded directly (dedupes the redundant findOne `getIssues`
    // would have re-issued), again in parallel.
    const [links1, links2] = await Promise.all([
      this.repo.findLinksByRelease(releaseId1),
      this.repo.findLinksByRelease(releaseId2),
    ]);
    const issues1 = links1.map((l) => l.issue);
    const issues2 = links2.map((l) => l.issue);

    const issue1Ids = new Set(issues1.map((i) => i.id));
    const issue2Ids = new Set(issues2.map((i) => i.id));

    return {
      release1: { id: rel1.id, name: rel1.name, issueCount: issues1.length },
      release2: { id: rel2.id, name: rel2.name, issueCount: issues2.length },
      addedIssues: issues2.filter((i) => !issue1Ids.has(i.id)),
      removedIssues: issues1.filter((i) => !issue2Ids.has(i.id)),
      commonIssues: issues1.filter((i) => issue2Ids.has(i.id)),
    };
  }

  async getLatestVersion(
    projectId: string,
    userId: string,
  ): Promise<string | null> {
    await this.assertMember(projectId, userId);
    // Single projected read + O(n) max-scan (was: full findAll + O(n log n) sort).
    const names = await this.repo.findVersionNames(projectId);
    return maxVersionName(names);
  }

  async suggestNextVersion(
    projectId: string,
    userId: string,
    bumpType: 'major' | 'minor' | 'patch' = 'patch',
  ): Promise<VersionSuggestion> {
    await this.assertMember(projectId, userId);
    // ONE fetch feeds both `allVersions` and the latest-version scan (the god
    // class issued two full `findAll`s — one here, one inside getLatestVersion).
    const allVersions = await this.repo.findVersionNames(projectId);
    const current = maxVersionName(allVersions);

    if (!current) {
      return { suggested: 'v1.0.0', current: null, allVersions };
    }
    const parsed = parseVersion(current);
    if (!parsed) {
      return { suggested: 'v1.0.0', current, allVersions };
    }
    return {
      suggested: formatVersion(bumpVersion(parsed, bumpType)),
      current,
      allVersions,
    };
  }
}

import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Issue } from '../issues/entities/issue.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { SearchAnalytics } from './entities/search-analytics.entity';
import { TenantContext } from '../core/tenant/tenant-context.service';
import { CacheService } from '../cache/cache.service';
import {
  PaginatedResponse,
  createPaginatedResponse,
} from '../releases/dto/paginated-response.dto';
import { SearchQueryDto } from './dto/search-query.dto';

const SEARCH_CACHE_NAMESPACE = 'search';
const SEARCH_CACHE_TTL_SECONDS = 60;

export interface IssueHit {
  id: string;
  title: string;
  key: string;
  projectId: string;
}

export interface ProjectHit {
  id: string;
  name: string;
  key?: string;
}

export interface UserHit {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface SearchResult {
  issues: PaginatedResponse<IssueHit>;
  projects: PaginatedResponse<ProjectHit>;
  users: PaginatedResponse<UserHit>;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(Issue)
    private issuesRepo: Repository<Issue>,
    @InjectRepository(Project)
    private projectsRepo: Repository<Project>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(SearchAnalytics)
    private analyticsRepo: Repository<SearchAnalytics>,
    private readonly tenantContext: TenantContext,
    private readonly cacheService: CacheService,
  ) {}

  async search(dto: SearchQueryDto, userId: string): Promise<SearchResult> {
    const { q, page, limit } = dto;
    const skip = (page - 1) * limit;

    // SECURITY: Get tenant ID from request context.
    const organizationId = this.tenantContext.getTenantId();
    if (!organizationId) {
      throw new ForbiddenException('Organization context required for search');
    }

    // Sanitize query for tsquery (escape PostgreSQL FTS operators).
    const sanitizedQuery = q.replace(/[&|!():*]/g, ' ').trim();
    if (!sanitizedQuery) {
      return {
        issues: createPaginatedResponse<IssueHit>([], page, limit, 0),
        projects: createPaginatedResponse<ProjectHit>([], page, limit, 0),
        users: createPaginatedResponse<UserHit>([], page, limit, 0),
      };
    }

    // SECURITY: Cache key MUST be tenant-scoped to prevent cross-org leakage.
    // userId is also folded in so future per-user permission filters cannot
    // serve a result computed under a different principal.
    const cacheKey = `search:${organizationId}:${userId}:global:${sanitizedQuery}:${page}:${limit}`;
    const cacheOpts = { namespace: SEARCH_CACHE_NAMESPACE };

    const cached = await this.cacheService.get<SearchResult>(
      cacheKey,
      cacheOpts,
    );
    if (cached) {
      const totalHits =
        cached.issues.meta.total +
        cached.projects.meta.total +
        cached.users.meta.total;
      this.trackSearchAnalytics(
        sanitizedQuery,
        totalHits,
        userId,
        organizationId,
      );
      return cached;
    }

    // Escape ILIKE wildcards in user-controlled input.
    const ilikeQuery = `%${sanitizedQuery.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

    // Parallelize all three counts+rows for latency.
    const [
      [issueRows, issueTotal],
      [projectRows, projectTotal],
      [userRows, userTotal],
    ] = await Promise.all([
      // Issues — TSVECTOR FTS with rank ordering, scoped to org via project FK.
      this.issuesRepo
        .createQueryBuilder('issue')
        .innerJoin('issue.project', 'project')
        .where('project.organizationId = :organizationId', { organizationId })
        .andWhere(
          "issue.search_vector @@ plainto_tsquery('english', :query)",
          { query: sanitizedQuery },
        )
        .orderBy(
          "ts_rank(issue.search_vector, plainto_tsquery('english', :query))",
          'DESC',
        )
        .select(['issue.id', 'issue.title', 'issue.projectId', 'issue.number'])
        .skip(skip)
        .take(limit)
        .getManyAndCount(),

      // Projects — direct tenant FK on the entity.
      this.projectsRepo
        .createQueryBuilder('project')
        .where('project.organizationId = :organizationId', { organizationId })
        .andWhere('project.name ILIKE :ilike', { ilike: ilikeQuery })
        .orderBy('project.name', 'ASC')
        .select(['project.id', 'project.name', 'project.key'])
        .skip(skip)
        .take(limit)
        .getManyAndCount(),

      // Users — STRICT tenant isolation via organizationId FK on user.
      // Searches both name and email, scoped to the caller's organization.
      this.usersRepo
        .createQueryBuilder('user')
        .where('user.organizationId = :organizationId', { organizationId })
        .andWhere('user.isActive = :isActive', { isActive: true })
        .andWhere(
          '(user.name ILIKE :ilike OR user.email ILIKE :ilike)',
          { ilike: ilikeQuery },
        )
        .orderBy('user.name', 'ASC')
        .select([
          'user.id',
          'user.name',
          'user.email',
          'user.avatarUrl',
        ])
        .skip(skip)
        .take(limit)
        .getManyAndCount(),
    ]);

    const issues: IssueHit[] = issueRows.map((i) => ({
      id: i.id,
      title: i.title,
      key: `${i.projectId?.substring(0, 4) || 'PROJ'}-${i.number || i.id.substring(0, 4)}`,
      projectId: i.projectId,
    }));

    const projects: ProjectHit[] = projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      key: p.key,
    }));

    const users: UserHit[] = userRows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
    }));

    const result: SearchResult = {
      issues: createPaginatedResponse(issues, page, limit, issueTotal),
      projects: createPaginatedResponse(projects, page, limit, projectTotal),
      users: createPaginatedResponse(users, page, limit, userTotal),
    };

    // Cache the fully assembled result. Short TTL keeps results fresh while
    // absorbing repeat keystrokes from typeahead clients (≤60s).
    await this.cacheService.set<SearchResult>(cacheKey, result, {
      namespace: SEARCH_CACHE_NAMESPACE,
      ttl: SEARCH_CACHE_TTL_SECONDS,
    });

    // Fire-and-forget analytics — must NOT block the HTTP response.
    this.trackSearchAnalytics(
      sanitizedQuery,
      issueTotal + projectTotal + userTotal,
      userId,
      organizationId,
    );

    return result;
  }

  /**
   * Records a search event for product analytics.
   *
   * Intentionally non-blocking: callers MUST NOT await this method.
   * Errors are swallowed (logged only) so analytics failures cannot
   * degrade the user-facing search response.
   */
  private trackSearchAnalytics(
    query: string,
    resultCount: number,
    userId: string,
    orgId: string,
  ): void {
    this.analyticsRepo
      .insert({ query, resultCount, userId, orgId })
      .catch((err: Error) =>
        this.logger.warn(
          `Failed to record search analytics for org ${orgId}: ${err.message}`,
        ),
      );
  }
}

import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Issue } from '../issues/entities/issue.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { TenantContext } from '../core/tenant/tenant-context.service';

export interface SearchResult {
  issues: { id: string; title: string; key: string; projectId: string }[];
  projects: { id: string; name: string }[];
  users: { id: string; name: string }[];
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Issue)
    private issuesRepo: Repository<Issue>,
    @InjectRepository(Project)
    private projectsRepo: Repository<Project>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private readonly tenantContext: TenantContext,
  ) {}

  async search(query: string): Promise<SearchResult> {
    if (!query || query.length < 2) {
      return { issues: [], projects: [], users: [] };
    }

    // SECURITY: Get tenant ID from request context
    const organizationId = this.tenantContext.getTenantId();
    if (!organizationId) {
      throw new ForbiddenException('Organization context required for search');
    }

    // Sanitize query for tsquery (escape special PostgreSQL full-text chars)
    const sanitizedQuery = query.replace(/[&|!():*]/g, ' ').trim();
    if (!sanitizedQuery) {
      return { issues: [], projects: [], users: [] };
    }

    // Parallelize queries for speed - all queries now include tenant filter
    const [issues, projects, users] = await Promise.all([
      // TSVECTOR full-text search with ranking (uses GIN index)
      this.issuesRepo
        .createQueryBuilder('issue')
        .leftJoin('issue.project', 'project')
        .where('project.organizationId = :organizationId', { organizationId })
        .andWhere("issue.search_vector @@ plainto_tsquery('english', :query)", {
          query: sanitizedQuery,
        })
        .orderBy(
          "ts_rank(issue.search_vector, plainto_tsquery('english', :query))",
          'DESC',
        )
        .setParameter('query', sanitizedQuery)
        .select(['issue.id', 'issue.title', 'issue.projectId', 'issue.number'])
        .take(20)
        .getMany(),

      // Projects filtered by organization (direct tenant filter)
      this.projectsRepo.find({
        where: {
          name: ILike(`%${query}%`),
          organizationId,
        },
        take: 5,
        select: ['id', 'name', 'key'],
      }),

      // Users: search within same org members (via membership)
      // For now, return empty - users don't have direct orgId
      // TODO: Implement via organization membership join
      Promise.resolve([] as Pick<User, 'id' | 'name'>[]),
    ]);

    return {
      issues: issues.map((i) => ({
        id: i.id,
        title: i.title,
        key: `${i.projectId?.substring(0, 4) || 'PROJ'}-${i.number || i.id.substring(0, 4)}`,
        projectId: i.projectId,
      })),
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      users: users.map((u) => ({ id: u.id, name: u.name })),
    };
  }
}

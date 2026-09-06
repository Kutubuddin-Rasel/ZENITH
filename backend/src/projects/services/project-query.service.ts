import {
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  CACHE_STORE_TOKEN,
  ENTITY_CACHE_TOKEN,
} from '../../cache/constants/cache.tokens';
import type {
  ICacheStore,
  IEntityCache,
} from '../../cache/interfaces/cache.interfaces';
import type { CachedProject } from '../../cache/cache.interfaces';
import { ProjectRepository } from '../../database/repositories/project.repository';
import {
  TENANT_CONTEXT_READER_TOKEN,
  TenantRepository,
  TenantRepositoryFactory,
  type ITenantContextReader,
} from '../../core/tenant';

import { Project } from '../entities/project.entity';
import type {
  IProjectQuery,
  ProjectSummary,
  ProjectWithMembership,
} from '../interfaces/projects.interfaces';

/**
 * ProjectQueryService
 *
 * Read-side surface of the projects aggregate. Bound to
 * `PROJECT_QUERY_TOKEN`. Consumes the abstract `ProjectRepository`
 * (DIP) plus the tenant-aware repository wrapper for organization
 * scoping. Returns `ProjectSummary` / `ProjectWithMembership` DTOs
 * exclusively — no TypeORM entities leak past this boundary.
 *
 * Tenant isolation
 * ----------------
 * `TenantRepositoryFactory.create(...)` returns a wrapper that
 * automatically applies `organizationId` filters to every query so
 * cross-tenant reads are statically impossible. The wrapper still
 * needs a concrete `Repository<Project>` (per factory contract), so
 * `@InjectRepository(Project)` is retained here ONLY as the wrapper's
 * upstream — never used directly for queries.
 *
 * Cache strategy
 * --------------
 * `findById` is the only cached path today (`getCachedProject` →
 * `cacheProject`). Cache misses cascade through the tenant wrapper
 * (if present) or the abstract repo. `findByKey` and `findForUser`
 * intentionally bypass the cache because their access patterns are
 * broader and stale risk outweighs hit-rate gains.
 *
 * Lifecycle: implements `OnModuleInit` to lazy-construct the tenant
 * wrapper (the factory may not be available in test contexts).
 */
@Injectable()
export class ProjectQueryService implements IProjectQuery, OnModuleInit {
  private tenantProjectRepo!: TenantRepository<Project>;

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly projects: ProjectRepository,
    @Inject(ENTITY_CACHE_TOKEN) private readonly entityCache: IEntityCache,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
    @Optional() private readonly tenantRepoFactory?: TenantRepositoryFactory,
    @Optional()
    @Inject(TENANT_CONTEXT_READER_TOKEN)
    private readonly tenantContext?: ITenantContextReader,
  ) {
    void this.cacheStore;
  }

  onModuleInit(): void {
    if (this.tenantRepoFactory) {
      this.tenantProjectRepo = this.tenantRepoFactory.create(
        this.projectRepo,
        'organizationId',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Public read surface (IProjectQuery)
  // ---------------------------------------------------------------------------

  async findById(projectId: string): Promise<ProjectSummary> {
    const cached = (await this.entityCache.getCachedProject(
      projectId,
    )) as SerializedProject | null;

    if (cached) {
      const currentTenantId = this.tenantContext?.getTenantId();
      if (
        currentTenantId &&
        cached.organizationId &&
        cached.organizationId !== currentTenantId
      ) {
        throw new NotFoundException('Project not found');
      }
      return this.cachedToSummary(cached);
    }

    const project = await this.resolveById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.entityCache.cacheProject(
      projectId,
      project as unknown as CachedProject,
    );

    return this.entityToSummary(project);
  }

  async findByKey(key: string): Promise<ProjectSummary | null> {
    const project = this.tenantProjectRepo
      ? await this.tenantProjectRepo.findOne({ where: { key } })
      : await this.projects.findByKey(key);

    return project ? this.entityToSummary(project) : null;
  }

  async findForUser(
    userId: string,
    isSuperAdmin: boolean,
  ): Promise<readonly ProjectWithMembership[]> {
    const organizationId = this.tenantContext?.getTenantId();

    if (isSuperAdmin && organizationId && this.tenantProjectRepo) {
      const projects = await this.tenantProjectRepo.find({
        where: { isArchived: false },
      });
      return projects.map((p) => this.entityToMembership(p, null));
    }

    if (!organizationId) {
      return [];
    }

    const projects = await this.projects.findForMember(userId, organizationId);
    return projects.map((p) => this.entityToMembership(p, null));
  }

  // ---------------------------------------------------------------------------
  // Private — persistence routing + DTO mapping
  // ---------------------------------------------------------------------------

  private async resolveById(projectId: string): Promise<Project | null> {
    if (this.tenantProjectRepo) {
      return this.tenantProjectRepo.findOne({ where: { id: projectId } });
    }
    return this.projects.findById(projectId);
  }

  private entityToSummary(project: Project): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      key: project.key,
      description: project.description ?? null,
      templateId: project.templateId ?? null,
      isArchived: project.isArchived,
      organizationId: project.organizationId ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private entityToMembership(
    project: Project,
    role: ProjectWithMembership['role'],
  ): ProjectWithMembership {
    return {
      ...this.entityToSummary(project),
      role,
    };
  }

  private cachedToSummary(cached: SerializedProject): ProjectSummary {
    return {
      id: cached.id,
      name: cached.name,
      key: cached.key,
      description: cached.description ?? null,
      templateId: cached.templateId ?? null,
      isArchived: cached.isArchived ?? false,
      organizationId: cached.organizationId ?? null,
      createdAt: cached.createdAt ? new Date(cached.createdAt) : new Date(0),
      updatedAt: cached.updatedAt ? new Date(cached.updatedAt) : new Date(0),
    };
  }
}

/**
 * Shape of a `Project` after JSON round-trip through Redis:
 *  - `Date` fields are serialized as ISO strings.
 *  - Optional columns may be missing entirely.
 *
 * Used only by `ProjectQueryService.findById` to map cached entries
 * back onto the `ProjectSummary` DTO without resorting to `any`.
 */
interface SerializedProject {
  id: string;
  name: string;
  key: string;
  description?: string | null;
  templateId?: string | null;
  isArchived?: boolean;
  organizationId?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

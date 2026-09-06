import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Project } from '../../projects/entities/project.entity';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { TenantRepositoryFactory, TenantRepository } from '../../core/tenant';
import { Issue } from '../entities/issue.entity';

/**
 * IssueKeyService
 *
 * Shared helper carved out of the legacy `IssuesService` god class. Owns
 * two cross-cutting concerns the CQRS services lean on:
 *
 *  1. **Tenant-scoped project lookup.** Wraps the concrete
 *     `Repository<Project>` with `TenantRepositoryFactory` in
 *     `onModuleInit` (after DI) so `findTenantProject` auto-filters by
 *     the current request's `organizationId` — the developer cannot
 *     forget the tenant clause. The concrete repo is injected ONLY for
 *     this wrapping; every non-tenant project read goes through the
 *     abstract `ProjectRepository` (DIP).
 *  2. **Friendly issue-key computation.** `computeKey` / `enrichWithKey`
 *     are verbatim ports — including the legacy whitespace in the key
 *     template (`"<KEY> -<n> "`) — to keep the emitted key byte-identical.
 */
@Injectable()
export class IssueKeyService implements OnModuleInit {
  private tenantProjectRepo!: TenantRepository<Project>;

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly projects: ProjectRepository,
    private readonly tenantRepoFactory: TenantRepositoryFactory,
  ) {}

  onModuleInit() {
    this.tenantProjectRepo = this.tenantRepoFactory.create(
      this.projectRepo,
      'organizationId',
    );
  }

  /**
   * Tenant-filtered project lookup. Returns `null` when the project does
   * not exist within the caller's organization (callers translate that
   * to `NotFoundException`).
   */
  findTenantProject(projectId: string): Promise<Project | null> {
    return this.tenantProjectRepo.findOne({ where: { id: projectId } });
  }

  /**
   * Compute friendly issue key from project key and issue number.
   * Example: project.key = "ZEN", issue.number = 42 → "ZEN-42".
   *
   * NOTE: the legacy template carried stray spaces; preserved verbatim
   * so existing key strings remain byte-identical.
   */
  computeKey(projectKey: string, issueNumber: number | null): string {
    if (!issueNumber) return '';
    return `${projectKey} -${issueNumber} `;
  }

  /**
   * Enrich an issue with its computed friendly key. Resolves the
   * project key when not supplied by the caller.
   */
  async enrichWithKey(
    issue: Issue,
    projectKey?: string,
  ): Promise<Issue & { key: string }> {
    let key = projectKey;
    if (!key) {
      const project = await this.projects.findById(issue.projectId);
      key = project?.key || '';
    }
    return {
      ...issue,
      key: this.computeKey(key || '', issue.number),
    };
  }
}

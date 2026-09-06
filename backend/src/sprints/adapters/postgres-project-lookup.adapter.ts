import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { TenantRepositoryFactory, TenantRepository } from '../../core/tenant';
import { ProjectLookupPort } from '../ports/project-lookup.port';

/**
 * Postgres adapter for `ProjectLookupPort`.
 *
 * Holds the raw `@InjectRepository(Project)` + `TenantRepositoryFactory`
 * plumbing that used to live inside `SprintsService.onModuleInit`. The
 * tenant wrapper auto-filters by `organizationId` (resolved from the
 * async tenant context), so `existsForTenant` answers strictly within
 * the caller's organization — identical to the legacy
 * `tenantProjectRepo.findOne` existence check, just relocated behind
 * the port.
 *
 * `Project` comes from the global core-entities module (the same place
 * the legacy service resolved it), so no `TypeOrmModule.forFeature`
 * change is needed.
 */
@Injectable()
export class PostgresProjectLookupAdapter
  extends ProjectLookupPort
  implements OnModuleInit
{
  private tenantProjectRepo!: TenantRepository<Project>;

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly tenantRepoFactory: TenantRepositoryFactory,
  ) {
    super();
  }

  onModuleInit(): void {
    this.tenantProjectRepo = this.tenantRepoFactory.create(
      this.projectRepo,
      'organizationId',
    );
  }

  async existsForTenant(projectId: string): Promise<boolean> {
    const project = await this.tenantProjectRepo.findOne({
      where: { id: projectId },
    });
    return !!project;
  }
}

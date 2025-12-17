/**
 * TenantRepositoryFactory - Creates TenantRepository instances
 *
 * This factory simplifies creating tenant-aware repositories in services.
 * It wraps any TypeORM Repository with automatic tenant filtering.
 *
 * Usage:
 *   constructor(
 *     private readonly tenantRepoFactory: TenantRepositoryFactory,
 *     @InjectRepository(Issue) private readonly issueRepo: Repository<Issue>,
 *   ) {
 *     this.tenantIssueRepo = tenantRepoFactory.create(issueRepo);
 *   }
 *
 *   // Then use tenantIssueRepo.find() - automatically filtered by tenant!
 */

import { Injectable } from '@nestjs/common';
import { Repository, ObjectLiteral } from 'typeorm';
import { TenantContext } from './tenant-context.service';
import { TenantRepository, TenantAwareEntity } from './tenant.repository';

@Injectable()
export class TenantRepositoryFactory {
  constructor(private readonly tenantContext: TenantContext) {}

  /**
   * Create a tenant-aware repository wrapper
   *
   * @param repository - The TypeORM repository to wrap
   * @param tenantField - The field name that contains organizationId (default: 'organizationId')
   * @returns A TenantRepository that auto-filters by tenant
   */
  create<T extends TenantAwareEntity>(
    repository: Repository<T>,
    tenantField: keyof T | string = 'organizationId',
  ): TenantRepository<T> {
    return new TenantRepository<T>(repository, this.tenantContext, tenantField);
  }

  /**
   * Create a tenant-aware repository that filters through a relation
   *
   * For entities like Issue that link to Project which has organizationId,
   * use this method with a join path.
   *
   * Example: For Issue → Project → organizationId
   *   createWithJoin(issueRepo, 'project', 'organizationId')
   *
   * Note: This requires the query to include the relation join.
   * Consider using the QueryBuilder approach for such entities.
   */
  createWithJoin<T extends ObjectLiteral>(
    repository: Repository<T>,
    relationName: string,
    tenantField: string = 'organizationId',
  ): TenantRepository<T> {
    // For join-based filtering, the caller must ensure the relation is joined
    // The tenantField will be applied as relation.tenantField
    const joinedField = `${relationName}.${tenantField}`;
    return new TenantRepository<T>(
      repository,
      this.tenantContext,
      joinedField as keyof T,
    );
  }
}

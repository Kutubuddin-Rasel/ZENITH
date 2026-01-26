/**
 * TenantRepositoryFactory - Creates TenantRepository instances
 *
 * This factory simplifies creating tenant-aware repositories in services.
 * It wraps any TypeORM Repository with automatic tenant filtering.
 *
 * Features:
 * - Automatic tenant filtering (organizationId)
 * - Automatic soft-delete filtering (deletedAt IS NULL)
 * - Soft delete/restore methods for supported entities
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
import {
  TenantRepository,
  TenantAwareEntity,
  SoftDeletableEntity,
} from './tenant.repository';

/**
 * Extended TenantRepository with soft delete capabilities
 */
export interface SoftDeletableTenantRepository<
  T extends SoftDeletableEntity,
> extends TenantRepository<T> {
  /**
   * Soft delete an entity by setting deletedAt timestamp
   * @param id - Entity ID to soft delete
   * @param deletedBy - Optional user ID who performed the delete
   */
  softDelete(id: string, deletedBy?: string): Promise<void>;

  /**
   * Restore a soft-deleted entity by clearing deletedAt
   * @param id - Entity ID to restore
   */
  restore(id: string): Promise<void>;

  /**
   * Find entities including soft-deleted ones (for admin/audit)
   */
  findWithDeleted(
    options?: Parameters<TenantRepository<T>['find']>[0],
  ): Promise<T[]>;
}

@Injectable()
export class TenantRepositoryFactory {
  constructor(private readonly tenantContext: TenantContext) {}

  /**
   * Create a tenant-aware repository wrapper
   *
   * @param repository - The TypeORM repository to wrap
   * @param tenantField - The field name that contains organizationId (default: 'organizationId')
   * @returns A TenantRepository that auto-filters by tenant and soft-delete
   */
  create<T extends TenantAwareEntity>(
    repository: Repository<T>,
    tenantField: keyof T | string = 'organizationId',
  ): TenantRepository<T> {
    return new TenantRepository<T>(repository, this.tenantContext, tenantField);
  }

  /**
   * Create a tenant-aware repository with explicit soft-delete support
   *
   * Use this for entities that have deletedAt column (e.g., Project)
   * Returns an extended repository with softDelete/restore/findWithDeleted methods
   *
   * @param repository - The TypeORM repository to wrap
   * @param tenantField - The field name that contains organizationId
   * @returns A SoftDeletableTenantRepository with additional soft delete methods
   */
  createWithSoftDelete<T extends SoftDeletableEntity>(
    repository: Repository<T>,
    tenantField: keyof T | string = 'organizationId',
  ): SoftDeletableTenantRepository<T> {
    const baseRepo = new TenantRepository<T>(
      repository,
      this.tenantContext,
      tenantField,
    );

    // Extend with soft delete methods
    const extendedRepo = Object.assign(baseRepo, {
      /**
       * Soft delete - sets deletedAt instead of hard delete
       */
      async softDelete(id: string, deletedBy?: string): Promise<void> {
        await repository.update(
          id as never,
          {
            deletedAt: new Date(),
            deletedBy: deletedBy || null,
          } as never,
        );
      },

      /**
       * Restore soft-deleted entity
       */
      async restore(id: string): Promise<void> {
        await repository.update(
          id as never,
          {
            deletedAt: null,
            deletedBy: null,
          } as never,
        );
      },

      /**
       * Find including soft-deleted records (bypasses deletedAt filter)
       * Useful for admin panels and audit trails
       */
      async findWithDeleted(
        options?: Parameters<typeof baseRepo.find>[0],
      ): Promise<T[]> {
        // Access the underlying repository directly to bypass soft-delete filter
        return repository.find(options);
      },
    });

    return extendedRepo as SoftDeletableTenantRepository<T>;
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

  /**
   * Check if an entity supports soft delete
   *
   * @param repository - The repository to check
   * @returns true if entity has deletedAt column
   */
  hasSoftDeleteSupport<T extends ObjectLiteral>(
    repository: Repository<T>,
  ): boolean {
    try {
      return repository.metadata.columns.some(
        (col) => col.propertyName === 'deletedAt',
      );
    } catch {
      return false;
    }
  }
}

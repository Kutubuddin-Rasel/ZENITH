/**
 * TenantRepositoryFactory — assembles `TenantRepository` instances
 * (SOLID Refactor Step 2).
 *
 * The factory is now a pure assembler: it injects the four
 * decomposed providers (query filter, write guard, RLS session
 * manager, unsafe-manager gate) and bundles them into the thin
 * `TenantRepository` adapter. No business logic lives here.
 *
 * BREAKING CHANGE — DOMAIN SCRUB
 *   The implicit `'organizationId'` default has been removed from
 *   every factory entry point. Callers must pass the tenant column
 *   name explicitly so that infrastructure no longer encodes a piece
 *   of the domain schema. Three call sites were migrated alongside
 *   this change (`projects`, `sprints`, `issues`).
 *
 * Usage:
 *   constructor(
 *     private readonly tenantRepoFactory: TenantRepositoryFactory,
 *     @InjectRepository(Issue) issueRepo: Repository<Issue>,
 *   ) {
 *     this.tenantIssueRepo = tenantRepoFactory.create(issueRepo, 'organizationId');
 *   }
 */

import { Injectable } from '@nestjs/common';
import type { ObjectLiteral, Repository } from 'typeorm';
import { TenantQueryFilter } from './repository/tenant-query.filter';
import { TenantWriteGuard } from './repository/tenant-write.guard';
import { TenantRlsSessionManager } from './repository/tenant-rls-session.manager';
import { UnsafeManagerGate } from './repository/unsafe-manager.gate';
import type {
  SoftDeletableEntity,
  TenantAwareEntity,
} from './interfaces/tenant-aware-entity.interface';
import {
  TenantRepository,
  TenantRepositoryProviders,
} from './tenant.repository';

/**
 * Extended TenantRepository with soft-delete capabilities.
 */
export interface SoftDeletableTenantRepository<
  T extends SoftDeletableEntity,
> extends TenantRepository<T> {
  softDelete(id: string, deletedBy?: string): Promise<void>;
  restore(id: string): Promise<void>;
  findWithDeleted(
    options?: Parameters<TenantRepository<T>['find']>[0],
  ): Promise<T[]>;
}

@Injectable()
export class TenantRepositoryFactory {
  private readonly providers: TenantRepositoryProviders;

  constructor(
    queryFilter: TenantQueryFilter,
    writeGuard: TenantWriteGuard,
    rlsSessionManager: TenantRlsSessionManager,
    unsafeManagerGate: UnsafeManagerGate,
  ) {
    this.providers = {
      queryFilter,
      writeGuard,
      rlsSessionManager,
      unsafeManagerGate,
    };
  }

  /**
   * Wrap a TypeORM repository with the tenant-aware adapter.
   *
   * @param repository  - The TypeORM repository to wrap.
   * @param tenantField - REQUIRED. The column on the entity that holds
   *                      the tenant id (e.g. `'organizationId'`).
   *                      Required by design — see file header.
   */
  create<T extends TenantAwareEntity>(
    repository: Repository<T>,
    tenantField: keyof T | string,
  ): TenantRepository<T> {
    return new TenantRepository<T>(repository, this.providers, tenantField);
  }

  /**
   * Wrap a repository for an entity that supports soft-delete,
   * exposing the supplemental `softDelete` / `restore` /
   * `findWithDeleted` helpers.
   *
   * @param tenantField - REQUIRED. The column on the entity that
   *                      holds the tenant id.
   */
  createWithSoftDelete<T extends SoftDeletableEntity>(
    repository: Repository<T>,
    tenantField: keyof T | string,
  ): SoftDeletableTenantRepository<T> {
    const baseRepo = new TenantRepository<T>(
      repository,
      this.providers,
      tenantField,
    );

    const extendedRepo = Object.assign(baseRepo, {
      async softDelete(id: string, deletedBy?: string): Promise<void> {
        await repository.update(
          id as never,
          {
            deletedAt: new Date(),
            deletedBy: deletedBy ?? null,
          } as never,
        );
      },

      async restore(id: string): Promise<void> {
        await repository.update(
          id as never,
          {
            deletedAt: null,
            deletedBy: null,
          } as never,
        );
      },

      async findWithDeleted(
        options?: Parameters<typeof baseRepo.find>[0],
      ): Promise<T[]> {
        return repository.find(options);
      },
    });

    return extendedRepo as SoftDeletableTenantRepository<T>;
  }

  /**
   * Wrap a repository where the tenant id lives on a related entity
   * (e.g. `Issue → Project → organizationId`).
   *
   * @param relationName - The relation alias used in joins.
   * @param tenantField  - REQUIRED. The column on the related entity
   *                       that holds the tenant id.
   */
  createWithJoin<T extends ObjectLiteral>(
    repository: Repository<T>,
    relationName: string,
    tenantField: string,
  ): TenantRepository<T> {
    const joinedField = `${relationName}.${tenantField}`;
    return new TenantRepository<T & TenantAwareEntity>(
      repository as Repository<T & TenantAwareEntity>,
      this.providers,
      joinedField as keyof (T & TenantAwareEntity),
    );
  }

  /**
   * True when the entity has a `deletedAt` column.
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

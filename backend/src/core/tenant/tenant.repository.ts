/**
 * TenantRepository — thin composition adapter (SOLID Refactor Step 2).
 *
 * The behaviour previously implemented inline in this 517-LOC class
 * has been decomposed into four focused, singleton providers:
 *
 *   - `TenantQueryFilter`         — read-side predicate merging
 *   - `TenantWriteGuard`          — IDOR / cross-tenant write checks
 *   - `TenantRlsSessionManager`   — Postgres RLS session orchestration
 *   - `UnsafeManagerGate`         — friction-based escape hatch
 *
 * This class now exists solely to preserve the public method surface
 * (`find`, `findOne`, `save`, `remove`, `createQueryBuilder`,
 * `setDbSession`, `getUnsafeManager`, …) so the 32 existing consumers
 * remain compilable. New code should compose the focused providers
 * directly via the segregated tokens — Step 3 will migrate consumers.
 *
 * Instances are produced by `TenantRepositoryFactory`, which injects
 * the four providers and forwards them down here.
 */

import type {
  DeepPartial,
  EntityManager,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import type { TenantQueryFilter } from './repository/tenant-query.filter';
import type { TenantWriteGuard } from './repository/tenant-write.guard';
import type { TenantRlsSessionManager } from './repository/tenant-rls-session.manager';
import type { UnsafeManagerGate } from './repository/unsafe-manager.gate';

import type { TenantAwareEntity } from './interfaces/tenant-aware-entity.interface';

// Re-export the entity contracts at their legacy import path so that
// existing consumers (`import { TenantAwareEntity } from '...repository'`)
// continue to resolve. Step 3 may migrate them to the interfaces folder.
export type {
  SoftDeletableEntity,
  TenantAwareEntity,
} from './interfaces/tenant-aware-entity.interface';

/**
 * Provider bundle handed to {@link TenantRepository} by the factory.
 *
 * Bundled to keep the constructor signature small even as the SRP
 * decomposition grows.
 */
export interface TenantRepositoryProviders {
  readonly queryFilter: TenantQueryFilter;
  readonly writeGuard: TenantWriteGuard;
  readonly rlsSessionManager: TenantRlsSessionManager;
  readonly unsafeManagerGate: UnsafeManagerGate;
}

export class TenantRepository<T extends TenantAwareEntity> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly providers: TenantRepositoryProviders,
    private readonly tenantField: keyof T | string,
  ) {}

  // ============================================================
  // READ OPERATIONS — delegated to TenantQueryFilter
  // ============================================================

  async find(options?: FindManyOptions<T>): Promise<T[]> {
    const filtered = this.providers.queryFilter.applyTenantFilter(
      this.repository,
      this.tenantField,
      options,
    );
    return this.repository.find(filtered);
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    const filtered = this.providers.queryFilter.applyTenantFilter(
      this.repository,
      this.tenantField,
      options,
    );
    return this.repository.findOne(filtered);
  }

  async findOneOrFail(options: FindOneOptions<T>): Promise<T> {
    const filtered = this.providers.queryFilter.applyTenantFilter(
      this.repository,
      this.tenantField,
      options,
    );
    return this.repository.findOneOrFail(filtered);
  }

  async findOneBy(where: FindOptionsWhere<T>): Promise<T | null> {
    return this.findOne({ where });
  }

  async count(options?: FindManyOptions<T>): Promise<number> {
    const filtered = this.providers.queryFilter.applyTenantFilter(
      this.repository,
      this.tenantField,
      options,
    );
    return this.repository.count(filtered);
  }

  async exists(options: FindManyOptions<T>): Promise<boolean> {
    return (await this.count(options)) > 0;
  }

  createQueryBuilder(
    alias: string,
    includeDeleted = false,
  ): SelectQueryBuilder<T> {
    return this.providers.queryFilter.createQueryBuilder(
      this.repository,
      this.tenantField,
      alias,
      includeDeleted,
    );
  }

  // ============================================================
  // WRITE OPERATIONS — delegated to TenantWriteGuard
  // ============================================================

  async save<E extends DeepPartial<T>>(entity: E): Promise<T>;
  async save<E extends DeepPartial<T>>(entities: E[]): Promise<T[]>;
  async save<E extends DeepPartial<T>>(
    entityOrEntities: E | E[],
  ): Promise<T | T[]> {
    if (Array.isArray(entityOrEntities)) {
      for (const entity of entityOrEntities) {
        this.providers.writeGuard.validateTenantOnWrite(entity);
      }
      return this.repository.save(entityOrEntities);
    }

    this.providers.writeGuard.validateTenantOnWrite(entityOrEntities);
    return this.repository.save(entityOrEntities);
  }

  async insert(entity: DeepPartial<T>): Promise<T> {
    this.providers.writeGuard.validateTenantOnWrite(entity);
    const result = await this.repository.insert(entity as never);
    return result.generatedMaps[0] as T;
  }

  async remove(entity: T): Promise<T>;
  async remove(entities: T[]): Promise<T[]>;
  async remove(entityOrEntities: T | T[]): Promise<T | T[]> {
    if (Array.isArray(entityOrEntities)) {
      for (const entity of entityOrEntities) {
        this.providers.writeGuard.validateTenantOwnership(entity);
      }
      return this.repository.remove(entityOrEntities);
    }

    this.providers.writeGuard.validateTenantOwnership(entityOrEntities);
    return this.repository.remove(entityOrEntities);
  }

  // ============================================================
  // PASSTHROUGH — entity construction & metadata
  // ============================================================

  create(entityLike: DeepPartial<T>): T;
  create(entityLikes: DeepPartial<T>[]): T[];
  create(entityLikeOrLikes: DeepPartial<T> | DeepPartial<T>[]): T | T[] {
    if (Array.isArray(entityLikeOrLikes)) {
      return this.repository.create(entityLikeOrLikes);
    }
    return this.repository.create(entityLikeOrLikes);
  }

  get metadata() {
    return this.repository.metadata;
  }

  // ============================================================
  // RLS — delegated to TenantRlsSessionManager
  // ============================================================

  async setDbSession(manager: EntityManager): Promise<void> {
    return this.providers.rlsSessionManager.setDbSession(manager);
  }

  async resetDbSession(manager: EntityManager): Promise<void> {
    return this.providers.rlsSessionManager.resetDbSession(manager);
  }

  // ============================================================
  // UNSAFE ESCAPE HATCH — delegated to UnsafeManagerGate
  // ============================================================

  getUnsafeManager(reason: string): EntityManager {
    return this.providers.unsafeManagerGate.getUnsafeManager(
      this.repository,
      reason,
    );
  }
}

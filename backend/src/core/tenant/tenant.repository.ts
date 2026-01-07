/**
 * TenantRepository - Safe Repository Pattern for automatic tenant isolation
 *
 * This abstract class wraps TypeORM's Repository and automatically injects
 * the tenant filter (organizationId) into all queries.
 *
 * PATTERN: Decorator Pattern - wraps Repository with additional behavior
 *
 * Usage:
 *   Instead of: @InjectRepository(Issue) issueRepo: Repository<Issue>
 *   Use:        @InjectRepository(Issue) issueRepo: TenantRepository<Issue>
 *
 * The developer writes: issueRepo.find({ where: { status: 'open' } })
 * The database receives: WHERE status = 'open' AND organizationId = :tenantId
 */

import {
  Repository,
  FindManyOptions,
  FindOneOptions,
  ObjectLiteral,
  SelectQueryBuilder,
  FindOptionsWhere,
  DeepPartial,
} from 'typeorm';
import { TenantContext } from './tenant-context.service';
import { Logger, ForbiddenException } from '@nestjs/common';

/**
 * Interface for entities that support tenant isolation
 * Entities must have an organizationId field (directly or via relation)
 */
export interface TenantAwareEntity extends ObjectLiteral {
  organizationId?: string;
  // Some entities link through project.organizationId
  project?: { organizationId?: string };
}

/**
 * Interface for entities that support soft delete
 */
export interface SoftDeletableEntity extends TenantAwareEntity {
  deletedAt?: Date | null;
}

/**
 * TenantRepository - Automatically applies tenant filtering
 *
 * This class intercepts all read operations and adds the tenant filter.
 * Write operations (save, update, delete) should be done after loading
 * the entity with tenant filtering to ensure access control.
 */
export class TenantRepository<T extends TenantAwareEntity> {
  private readonly logger = new Logger('TenantRepository');

  constructor(
    private readonly repository: Repository<T>,
    private readonly tenantContext: TenantContext,
    private readonly tenantField: keyof T | string = 'organizationId',
  ) {}

  /**
   * Get the current tenant ID from context
   * Returns undefined if no tenant or bypass is enabled
   */
  private getCurrentTenantId(): string | undefined {
    if (this.tenantContext.isBypassEnabled()) {
      this.logger.debug('Tenant bypass enabled - skipping filter');
      return undefined;
    }
    return this.tenantContext.getTenantId();
  }

  /**
   * Merge tenant filter into existing where clause
   * Also applies soft-delete filter if entity has deletedAt field
   */
  private applyTenantFilter<O extends FindManyOptions<T> | FindOneOptions<T>>(
    options?: O,
    includeDeleted = false,
  ): O {
    const tenantId = this.getCurrentTenantId();

    // Build base filter
    const baseFilter: Record<string, unknown> = {};

    // Add tenant filter if available
    if (tenantId) {
      baseFilter[this.tenantField as string] = tenantId;
    }

    // Add soft-delete filter if entity supports it and not bypassed
    if (!includeDeleted && this.hasSoftDelete()) {
      baseFilter['deletedAt'] = null; // TypeORM treats null as IS NULL
    }

    // If no filters to apply, return options as-is
    if (Object.keys(baseFilter).length === 0) {
      return options || ({} as O);
    }

    const filter = baseFilter as FindOptionsWhere<T>;

    if (!options) {
      return { where: filter } as O;
    }

    if (!options.where) {
      return { ...options, where: filter } as O;
    }

    // Merge with existing where clause
    if (Array.isArray(options.where)) {
      // OR conditions - apply filter to each
      return {
        ...options,
        where: options.where.map((w) => ({ ...w, ...filter })),
      } as O;
    }

    // Single where object - merge filter
    return {
      ...options,
      where: { ...options.where, ...filter },
    } as O;
  }

  /**
   * Check if entity has soft delete support (deletedAt field)
   */
  private hasSoftDelete(): boolean {
    try {
      return this.repository.metadata.columns.some(
        (col) => col.propertyName === 'deletedAt',
      );
    } catch {
      return false;
    }
  }

  // ============================================================
  // READ OPERATIONS - Automatically filtered by tenant
  // ============================================================

  /**
   * Find multiple entities - TENANT FILTERED
   */
  async find(options?: FindManyOptions<T>): Promise<T[]> {
    const filteredOptions = this.applyTenantFilter(options);
    return this.repository.find(filteredOptions);
  }

  /**
   * Find one entity - TENANT FILTERED
   */
  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    const filteredOptions = this.applyTenantFilter(options);
    return this.repository.findOne(filteredOptions);
  }

  /**
   * Find one entity or throw - TENANT FILTERED
   */
  async findOneOrFail(options: FindOneOptions<T>): Promise<T> {
    const filteredOptions = this.applyTenantFilter(options);
    return this.repository.findOneOrFail(filteredOptions);
  }

  /**
   * Find by ID(s) - TENANT FILTERED
   * Note: Uses findOne internally with tenant filter
   */
  async findOneBy(where: FindOptionsWhere<T>): Promise<T | null> {
    return this.findOne({ where });
  }

  /**
   * Count entities - TENANT FILTERED
   */
  async count(options?: FindManyOptions<T>): Promise<number> {
    const filteredOptions = this.applyTenantFilter(options);
    return this.repository.count(filteredOptions);
  }

  /**
   * Check if exists - TENANT FILTERED
   */
  async exists(options: FindManyOptions<T>): Promise<boolean> {
    const count = await this.count(options);
    return count > 0;
  }

  /**
   * Create a query builder with tenant and soft-delete filters pre-applied
   *
   * Returns a QueryBuilder with the tenant WHERE clause already added.
   * Developer can chain additional conditions.
   */
  createQueryBuilder(
    alias: string,
    includeDeleted = false,
  ): SelectQueryBuilder<T> {
    const qb = this.repository.createQueryBuilder(alias);

    const tenantId = this.getCurrentTenantId();
    if (tenantId) {
      // Apply tenant filter using the configured field
      const fieldPath =
        typeof this.tenantField === 'string'
          ? `${alias}.${this.tenantField}`
          : `${alias}.${String(this.tenantField)}`;
      qb.andWhere(`${fieldPath} = :tenantId`, { tenantId });
    }

    // Apply soft-delete filter if entity supports it
    if (!includeDeleted && this.hasSoftDelete()) {
      qb.andWhere(`${alias}."deletedAt" IS NULL`);
    }

    return qb;
  }

  // ============================================================
  // WRITE OPERATIONS - WITH TENANT VALIDATION
  // Security: Validates organizationId matches current context
  // ============================================================

  /**
   * Validate entity has correct tenant ID before write
   * Throws ForbiddenException if mismatch detected
   */
  private validateTenantOnWrite(entity: DeepPartial<T>): void {
    const tenantId = this.getCurrentTenantId();

    // Skip validation if bypass enabled or no tenant context
    if (!tenantId) return;

    // Get entity's organizationId
    const entityOrgId = (entity as TenantAwareEntity).organizationId;

    // Skip if entity doesn't have organizationId (new entity or non-tenant entity)
    if (entityOrgId === undefined) return;

    // SECURITY: Reject if attempting to write to different tenant
    if (entityOrgId !== tenantId) {
      this.logger.error(
        `Tenant violation detected! Context: ${tenantId}, Entity: ${entityOrgId}`,
      );
      throw new ForbiddenException(
        'Cannot write entity belonging to different organization',
      );
    }
  }

  /**
   * Save entity - WITH TENANT VALIDATION
   * Validates organizationId matches current context before write
   */
  async save<E extends DeepPartial<T>>(entity: E): Promise<T>;
  async save<E extends DeepPartial<T>>(entities: E[]): Promise<T[]>;
  async save<E extends DeepPartial<T>>(
    entityOrEntities: E | E[],
  ): Promise<T | T[]> {
    if (Array.isArray(entityOrEntities)) {
      // Validate each entity in batch
      for (const entity of entityOrEntities) {
        this.validateTenantOnWrite(entity);
      }
      return this.repository.save(entityOrEntities);
    }

    // Validate single entity
    this.validateTenantOnWrite(entityOrEntities);
    return this.repository.save(entityOrEntities);
  }

  /**
   * Insert entity - WITH TENANT VALIDATION
   * Validates organizationId matches current context before insert
   */
  async insert(entity: DeepPartial<T>): Promise<T> {
    this.validateTenantOnWrite(entity);
    const result = await this.repository.insert(entity as never);
    return result.generatedMaps[0] as T;
  }

  /**
   * Remove entity - PASSTHROUGH
   * Note: Entity should have been loaded with tenant filter
   */
  async remove(entity: T): Promise<T>;
  async remove(entities: T[]): Promise<T[]>;
  async remove(entityOrEntities: T | T[]): Promise<T | T[]> {
    if (Array.isArray(entityOrEntities)) {
      return this.repository.remove(entityOrEntities);
    }
    return this.repository.remove(entityOrEntities);
  }

  /**
   * Create entity instance - PASSTHROUGH
   */
  create(entityLike: DeepPartial<T>): T;
  create(entityLikes: DeepPartial<T>[]): T[];
  create(entityLikeOrLikes: DeepPartial<T> | DeepPartial<T>[]): T | T[] {
    if (Array.isArray(entityLikeOrLikes)) {
      return this.repository.create(entityLikeOrLikes);
    }
    return this.repository.create(entityLikeOrLikes);
  }

  /**
   * Get the underlying repository for advanced operations
   * WARNING: Use with caution - bypasses tenant filtering!
   */
  get manager() {
    return this.repository.manager;
  }

  /**
   * Get repository metadata
   */
  get metadata() {
    return this.repository.metadata;
  }
}

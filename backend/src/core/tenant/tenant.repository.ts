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
  EntityManager,
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
   * Remove entity - WITH TENANT VALIDATION (Phase 3)
   *
   * ZERO TRUST STRATEGY:
   * Even though entities should be loaded with tenant filter, we MUST validate
   * on remove because:
   * 1. Entity could be loaded in bypass mode and passed to non-bypass context
   * 2. Entity could be cached/stored and reused across different contexts
   * 3. Defense in depth prevents bugs from becoming security vulnerabilities
   *
   * Validates organizationId matches current context before deletion.
   * Throws ForbiddenException if mismatch detected.
   */
  async remove(entity: T): Promise<T>;
  async remove(entities: T[]): Promise<T[]>;
  async remove(entityOrEntities: T | T[]): Promise<T | T[]> {
    if (Array.isArray(entityOrEntities)) {
      // Validate EACH entity before ANY deletion (prevent partial deletes)
      for (const entity of entityOrEntities) {
        this.validateTenantOwnership(entity);
      }
      return this.repository.remove(entityOrEntities);
    }

    // Validate single entity
    this.validateTenantOwnership(entityOrEntities);
    return this.repository.remove(entityOrEntities);
  }

  /**
   * Validate entity ownership before destructive operations (Phase 3)
   *
   * JIT (Just-In-Time) Validation:
   * Called immediately before remove/delete operations to ensure the entity
   * belongs to the current tenant context.
   *
   * BYPASS INTEGRATION:
   * If tenantContext.isBypassEnabled() is true, validation is skipped.
   * The operator has already been audited (Phase 1) and we trust them.
   *
   * @param entity - The entity to validate
   * @throws ForbiddenException if entity.organizationId !== current tenant
   */
  private validateTenantOwnership(entity: T): void {
    const currentTenantId = this.tenantContext.getTenantId();

    // Skip validation if bypass is enabled (operator already audited in Phase 1)
    if (this.tenantContext.isBypassEnabled()) {
      this.logger.debug(
        `Bypass enabled - skipping tenant ownership validation for remove`,
      );
      return;
    }

    // Skip if no tenant context (public/system operation)
    if (!currentTenantId) {
      this.logger.debug(
        `No tenant context - skipping ownership validation for remove`,
      );
      return;
    }

    // Get entity's organizationId (uses TenantAwareEntity constraint)
    const entityOrgId = (entity as TenantAwareEntity).organizationId;

    // Skip if entity doesn't have organizationId (non-tenant entity)
    if (entityOrgId === undefined) {
      this.logger.debug(
        `Entity has no organizationId - skipping ownership validation`,
      );
      return;
    }

    // SECURITY: Reject if attempting to delete entity from different tenant
    if (entityOrgId !== currentTenantId) {
      this.logger.error(
        `🚨 IDOR ATTACK BLOCKED: Attempted to delete entity ` +
          `(org: ${entityOrgId}) from context (tenant: ${currentTenantId})`,
      );
      throw new ForbiddenException(
        'Cannot delete entity belonging to different organization',
      );
    }

    this.logger.debug(
      `Tenant ownership validated for remove: ${currentTenantId}`,
    );
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
   * Get the underlying EntityManager for advanced operations (Phase 4)
   *
   * ⚠️ SECURITY WARNING: BYPASSES ALL TENANT ISOLATION ⚠️
   *
   * This method provides direct access to TypeORM's EntityManager, which:
   * - Bypasses all tenant filtering (RLS, query filters)
   * - Bypasses soft-delete filters
   * - Has NO audit trail for the bypass
   * - Can read/write data from ANY tenant
   *
   * USE ONLY WHEN ABSOLUTELY NECESSARY:
   * - Batch operations that span tenants (with proper authorization)
   * - Database migrations
   * - System-level maintenance scripts
   *
   * FRICTION-BASED SECURITY:
   * The old `manager` getter has been intentionally removed and replaced
   * with this method that requires a written justification. This forces
   * developers to:
   * 1. Acknowledge the security implications
   * 2. Document WHY bypass is needed
   * 3. Leave an audit trail in the codebase
   *
   * @param reason - Written justification for bypassing tenant isolation
   *                 (e.g., "Batch cleanup of orphaned records across tenants")
   * @returns TypeORM EntityManager with FULL database access
   *
   * @example
   * // ❌ OLD (no longer works - compile error)
   * this.repo.manager.save(entities);
   *
   * // ✅ NEW (requires justification)
   * this.repo.getUnsafeManager('Batch import from CSV').save(entities);
   */
  getUnsafeManager(reason: string): import('typeorm').EntityManager {
    // Validate reason is provided and non-empty
    if (!reason || reason.trim().length === 0) {
      throw new Error(
        'getUnsafeManager requires a non-empty reason explaining why tenant bypass is needed',
      );
    }

    // Log warning for every access (audit trail in logs)
    this.logger.warn(
      `⚠️ UNSAFE EntityManager accessed - TENANT ISOLATION BYPASSED. Reason: "${reason}"`,
    );

    return this.repository.manager;
  }

  /**
   * Get repository metadata
   */
  get metadata() {
    return this.repository.metadata;
  }

  // ===========================================================================
  // PHASE 5: POSTGRESQL ROW-LEVEL SECURITY (RLS) INTEGRATION
  // ===========================================================================

  /**
   * Set the database session variable for Row-Level Security (Phase 5)
   *
   * This method sets the PostgreSQL session variable `app.current_tenant`
   * which is used by RLS policies to filter rows at the database level.
   *
   * CRITICAL: RLS POLICY LOGIC
   * - When app.current_tenant IS NULL → bypass (returns all rows)
   * - When app.current_tenant is set → only matching organization_id rows
   *
   * CONNECTION POOL SAFETY:
   * Uses SET LOCAL which scopes the variable to the CURRENT TRANSACTION only.
   * This prevents cross-request leakage in pooled connections.
   * Caller MUST be within a transaction for this to work correctly.
   *
   * BYPASS INTEGRATION:
   * When tenantContext.isBypassEnabled() is true, this method does nothing.
   * RLS policy will see NULL and return all rows.
   *
   * USAGE:
   * ```typescript
   * await manager.transaction(async (txManager) => {
   *   await repo.setDbSession(txManager);
   *   // All queries now filtered by RLS
   *   const data = await txManager.find(Entity);
   * });
   * ```
   *
   * @param manager - The EntityManager to set the session on (usually transaction manager)
   */
  async setDbSession(manager: EntityManager): Promise<void> {
    // Skip if bypass is enabled (RLS policy allows NULL = all rows)
    if (this.tenantContext.isBypassEnabled()) {
      this.logger.debug('Bypass enabled - skipping RLS session variable');
      return;
    }

    const tenantId = this.tenantContext.getTenantId();

    // Skip if no tenant context (public/system operation)
    if (!tenantId) {
      this.logger.debug('No tenant context - skipping RLS session variable');
      return;
    }

    // Set the session variable for RLS policies
    // SET LOCAL scopes to current transaction (connection pool safe)
    await manager.query('SET LOCAL app.current_tenant = $1', [tenantId]);

    this.logger.debug(
      `RLS session variable set: app.current_tenant = ${tenantId}`,
    );
  }

  /**
   * Reset the database session variable (optional cleanup)
   *
   * While SET LOCAL automatically clears at transaction end,
   * this method can be used for explicit cleanup if needed.
   *
   * @param manager - The EntityManager to reset the session on
   */
  async resetDbSession(manager: EntityManager): Promise<void> {
    await manager.query('RESET app.current_tenant');
    this.logger.debug('RLS session variable reset');
  }
}

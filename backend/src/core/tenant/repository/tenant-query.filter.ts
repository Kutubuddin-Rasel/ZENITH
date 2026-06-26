/**
 * TenantQueryFilter — read-side SRP provider.
 *
 * Owns the logic that merges the tenant predicate (and the
 * soft-delete predicate, when applicable) into TypeORM
 * `FindManyOptions` / `FindOneOptions` and `SelectQueryBuilder`
 * instances. Stateless and entity-agnostic — the repository and
 * tenant column path are passed in as method arguments so this
 * provider can be a singleton.
 *
 * DIP: depends on `ITenantContextReader` via the segregated token,
 *      never on the concrete `TenantContext`.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { TENANT_CONTEXT_READER_TOKEN } from '../constants/tenant.tokens';
import type { ITenantContextReader } from '../interfaces/tenant.interfaces';
import type { TenantAwareEntity } from '../interfaces/tenant-aware-entity.interface';

@Injectable()
export class TenantQueryFilter {
  private readonly logger = new Logger(TenantQueryFilter.name);

  constructor(
    @Inject(TENANT_CONTEXT_READER_TOKEN)
    private readonly reader: ITenantContextReader,
  ) {}

  /**
   * Resolve the tenant id that should scope the current query, or
   * `undefined` when bypass is active or no tenant is bound.
   */
  getCurrentTenantId(): string | undefined {
    if (this.reader.isBypassEnabled()) {
      this.logger.debug('Tenant bypass enabled - skipping filter');
      return undefined;
    }
    return this.reader.getTenantId();
  }

  /**
   * Inspect TypeORM metadata to detect a `deletedAt` column.
   */
  hasSoftDelete<T extends TenantAwareEntity>(
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

  /**
   * Merge the tenant predicate (and optional soft-delete predicate)
   * into the supplied find options.
   */
  applyTenantFilter<
    T extends TenantAwareEntity,
    O extends FindManyOptions<T> | FindOneOptions<T>,
  >(
    repository: Repository<T>,
    tenantField: keyof T | string,
    options?: O,
    includeDeleted = false,
  ): O {
    const tenantId = this.getCurrentTenantId();
    const baseFilter: Record<string, unknown> = {};

    if (tenantId) {
      baseFilter[tenantField as string] = tenantId;
    }

    if (!includeDeleted && this.hasSoftDelete(repository)) {
      baseFilter['deletedAt'] = null;
    }

    if (Object.keys(baseFilter).length === 0) {
      return options ?? ({} as O);
    }

    const filter = baseFilter as FindOptionsWhere<T>;

    if (!options) {
      return { where: filter } as O;
    }

    if (!options.where) {
      return { ...options, where: filter } as O;
    }

    if (Array.isArray(options.where)) {
      return {
        ...options,
        where: options.where.map((w) => ({ ...w, ...filter })),
      } as O;
    }

    return {
      ...options,
      where: { ...options.where, ...filter },
    } as O;
  }

  /**
   * Build a `SelectQueryBuilder` with the tenant (and soft-delete)
   * predicates pre-attached. The caller chains additional clauses.
   */
  createQueryBuilder<T extends TenantAwareEntity>(
    repository: Repository<T>,
    tenantField: keyof T | string,
    alias: string,
    includeDeleted = false,
  ): SelectQueryBuilder<T> {
    const qb = repository.createQueryBuilder(alias);

    const tenantId = this.getCurrentTenantId();
    if (tenantId) {
      const fieldPath =
        typeof tenantField === 'string'
          ? `${alias}.${tenantField}`
          : `${alias}.${String(tenantField)}`;
      qb.andWhere(`${fieldPath} = :tenantId`, { tenantId });
    }

    if (!includeDeleted && this.hasSoftDelete(repository)) {
      qb.andWhere(`${alias}."deletedAt" IS NULL`);
    }

    return qb;
  }
}

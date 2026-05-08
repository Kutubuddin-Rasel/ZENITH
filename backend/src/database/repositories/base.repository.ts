import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  SaveOptions,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

/**
 * BaseRepository<TEntity, TId>
 *
 * Abstract data-access contract for every aggregate root in the system.
 * Concrete implementations (TypeORM-backed in Step 2, in-memory test fakes,
 * etc.) MUST satisfy every method below in full — no `NotImplementedException`,
 * no silent fall-throughs (LSP).
 *
 * SOLID guarantees:
 *  - DIP: services depend on this abstract class as the injection token; they
 *         must NEVER depend on `Repository<T>` from `typeorm` directly.
 *  - LSP: every concrete subclass honors the full surface of this contract.
 *  - ISP: this is the *infrastructure* contract; consumer-facing role
 *         interfaces (IIssueReader / IIssueWriter / …) live in
 *         `database/interfaces/repository.interfaces.ts` and expose only the
 *         subset each call-site actually needs.
 *
 * Type parameters:
 *  - TEntity: domain entity (must extend TypeORM `ObjectLiteral`).
 *  - TId:     primary-key type (defaults to `string` — Zenith uses UUID PKs).
 */
export abstract class BaseRepository<
  TEntity extends ObjectLiteral,
  TId = string,
> {
  /** Find a single entity by primary key. Resolves to `null` when not found. */
  abstract findById(id: TId): Promise<TEntity | null>;

  /** Find a single entity matching `options`. Resolves to `null` when not found. */
  abstract findOne(options: FindOneOptions<TEntity>): Promise<TEntity | null>;

  /** Find every entity matching `options`. Callers MUST paginate large reads. */
  abstract findMany(options?: FindManyOptions<TEntity>): Promise<TEntity[]>;

  /** Find entities and total count in one round-trip — preferred for paginated lists. */
  abstract findAndCount(
    options?: FindManyOptions<TEntity>,
  ): Promise<[TEntity[], number]>;

  /** Count entities matching `where`. */
  abstract count(where?: FindOptionsWhere<TEntity>): Promise<number>;

  /** Existence check — preferred over `count(...) > 0` (DB-side `EXISTS`). */
  abstract exists(where: FindOptionsWhere<TEntity>): Promise<boolean>;

  /** Construct an entity instance in memory without persisting it. */
  abstract create(data: DeepPartial<TEntity>): TEntity;

  /** Persist a new or existing entity (upsert semantics by primary key). */
  abstract save(
    data: DeepPartial<TEntity>,
    options?: SaveOptions,
  ): Promise<TEntity>;

  /** Persist many entities in a single transaction. */
  abstract saveMany(
    data: DeepPartial<TEntity>[],
    options?: SaveOptions,
  ): Promise<TEntity[]>;

  /** Partial update by primary key — emits `UPDATE` without re-loading the row. */
  abstract update(
    id: TId,
    patch: QueryDeepPartialEntity<TEntity>,
  ): Promise<void>;

  /** Hard-delete an entity (irreversible). */
  abstract remove(entity: TEntity): Promise<TEntity>;

  /**
   * Soft-delete an entity. Requires the entity to declare `@DeleteDateColumn`.
   * Aggregates without soft-delete support MUST omit this method from their
   * role-segregated `*Writer` interface (see ISP guidance in interfaces file).
   */
  abstract softRemove(entity: TEntity): Promise<TEntity>;

  /** Restore a soft-deleted entity by primary key (counterpart to `softRemove`). */
  abstract restore(id: TId): Promise<void>;
}

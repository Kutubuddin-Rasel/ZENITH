import { FindOptionsWhere, ObjectLiteral } from 'typeorm';

/**
 * Merge a static scope (e.g. `{ projectId }`) into a caller-supplied
 * `FindOptionsWhere`. Handles BOTH the single-object and array forms used by
 * TypeORM's `where` slot (`FindOptionsWhere<T> | FindOptionsWhere<T>[]`).
 *
 * The scope wins on conflicting keys — entity-specific finders
 * (`findByProject`, `findByOrganization`, …) MUST scope authoritatively.
 */
export function mergeWhere<TEntity extends ObjectLiteral>(
  base: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[] | undefined,
  scope: FindOptionsWhere<TEntity>,
): FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[] {
  if (!base) return scope;
  if (Array.isArray(base)) {
    return base.map((clause) => ({ ...clause, ...scope }));
  }
  return { ...base, ...scope };
}

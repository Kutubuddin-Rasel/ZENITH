/**
 * API Keys Module — Abstract Repository (DIP Boundary, Step 2)
 *
 * This is the ONLY allowed persistence contract for the `api-keys`
 * aggregate. Concrete implementations (`PostgresApiKeyRepository`)
 * own `@InjectRepository(ApiKey)` and `DataSource` exclusively — no
 * service, controller, guard, or cron may inject the TypeORM
 * repository directly.
 *
 * Abstract-class-as-DI-token: NestJS resolves this binding by
 * reference identity on the class symbol, mirroring how
 * `AbstractInviteRepository` is bound in the invites module. There is
 * therefore NO `API_KEY_REPOSITORY_TOKEN` in
 * `constants/api-keys.tokens.ts` — the abstract class itself IS the
 * token.
 *
 * Return-type policy
 * ------------------
 * Methods return the raw `ApiKey` entity (not `ApiKeySummary`)
 * because Step 2 is a structural pivot only — the legacy
 * `ApiKeysService` still mutates entity fields directly
 * (`oldKey.revokeAt = …`, `key.unusedNotifiedAt = …`) and the guard
 * still consumes the joined `user`/`project` relations. Step 3
 * introduces `ApiKeyQueryService` / `ApiKeyValidatorService`, which
 * project to the sanitized `ApiKeySummary` / `ValidatedApiKey` DTOs
 * at the read boundary. The mutation services keep round-tripping
 * through the entity inside this module while exposing only DTOs
 * across the public ISP surface.
 *
 * Bandwidth-sensitive paths (cleanup cron) use `Pick<ApiKey, …>` so
 * the impl can apply `.select(['id', 'keyPrefix', …])` and the type
 * system enforces that callers do not reach for unprojected fields.
 *
 * Transaction policy
 * ------------------
 * `rotateInTransaction` is the ONLY transactional API. It closes the
 * read-modify-write window between the two unprotected `save()`
 * calls in the legacy `ApiKeysService.rotateKey` (lines 266 + 271),
 * where a crash between them would leave the new key live AND the
 * old key un-revoked. The repository owns the full lifecycle
 * (connect → start → commit/rollback → release) — callers never see
 * `DataSource` or `QueryRunner`.
 */

import type { ApiKey } from '../../entities/api-key.entity';

/**
 * Projection used by the cleanup cron's purge job. Only the fields
 * required to record the audit trail before `batchDelete` are
 * surfaced — the impl applies `.select([...])` so the wire payload
 * stays small even for batches of 1000.
 */
export type ExpiredApiKeyRow = Pick<
  ApiKey,
  'id' | 'keyPrefix' | 'userId' | 'revokeAt'
>;

/**
 * Projection used by the cleanup cron's anomaly-detection job.
 * `rateLimit` is included so the Redis-violation comparison stays
 * single-query.
 */
export type ActiveApiKeyRow = Pick<
  ApiKey,
  'id' | 'keyPrefix' | 'userId' | 'rateLimit'
>;

/**
 * Result of `rotateInTransaction`. Both fields reflect the
 * post-commit state. `oldKey.revokeAt` and `oldKey.rotatedToKeyId`
 * are guaranteed set; `newKey.id` is guaranteed populated.
 */
export interface RotateInTransactionResult {
  readonly oldKey: ApiKey;
  readonly newKey: ApiKey;
}

export abstract class AbstractApiKeyRepository {
  // ---------------------------------------------------------------------------
  // Reads — command & query paths
  // ---------------------------------------------------------------------------

  /** Resolve by primary key. Returns `null` if not found. */
  abstract findById(id: string): Promise<ApiKey | null>;

  /**
   * Resolve by `(id, userId)`. Used by `revoke`, `update`, and the
   * `findOne` controller endpoint to scope every read to the owning
   * user.
   */
  abstract findOneByIdForUser(
    id: string,
    userId: string,
  ): Promise<ApiKey | null>;

  /**
   * Resolve by `(id, userId)` AND `isActive = true`. Used by `rotate`
   * to refuse rotation of a soft-disabled key.
   */
  abstract findOneActiveByIdForUser(
    id: string,
    userId: string,
  ): Promise<ApiKey | null>;

  /**
   * List every key owned by `userId`, ordered newest-first. Matches
   * the legacy `findAll` contract.
   */
  abstract findAllByUserId(userId: string): Promise<ApiKey[]>;

  /**
   * Validator hot-path lookup. Returns every active key whose
   * `keyPrefix` matches the candidate — there can be multiple if a
   * rotation is mid-grace-period, so the caller still has to
   * bcrypt-compare each row. Eager-loads `user` + `project` so the
   * validator can hydrate `ValidatedApiKey.organizationId` without
   * leaving the module.
   */
  abstract findByKeyPrefixActive(keyPrefix: string): Promise<ApiKey[]>;

  // ---------------------------------------------------------------------------
  // Reads — cleanup cron paths (narrowed projections)
  // ---------------------------------------------------------------------------

  /**
   * Return the next `batchSize` keys whose `revokeAt` is strictly
   * before `cutoff`. Used by the purge job to chunk-delete expired
   * rows without table-locking the live workload.
   */
  abstract findExpiredBefore(
    cutoff: Date,
    batchSize: number,
  ): Promise<ExpiredApiKeyRow[]>;

  /**
   * Unused-key candidates for the notification cron.
   *
   * Selects rows where ALL of the following hold:
   *  - `createdAt < cutoff` (the key is old enough to count as stale)
   *  - `isActive = true`
   *  - `unusedNotifiedAt IS NULL` (idempotency — never email twice)
   *  - `lastUsedAt IS NULL OR lastUsedAt < cutoff`
   *
   * Ordered oldest-first so the daily cap surfaces the longest-unused
   * keys first. Returns full entities because the cleanup job still
   * mutates `unusedNotifiedAt` and calls `save(entity)` — Step 3
   * narrows this to a Pick once `markUnusedNotified(id, ts)` replaces
   * the round-trip.
   */
  abstract findUnusedCandidates(cutoff: Date, cap: number): Promise<ApiKey[]>;

  /**
   * Every active key. Used by the rate-limit anomaly detector to
   * fan-out per-key Redis lookups. Narrowed to the four fields the
   * detector actually consumes.
   */
  abstract findAllActive(): Promise<ActiveApiKeyRow[]>;

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * Persist a new or modified entity. Mirrors
   * `Repository<ApiKey>.save` semantics (insert-or-update by primary
   * key). Returns the persisted entity (so callers see DB defaults
   * like `createdAt`).
   */
  abstract save(entity: ApiKey): Promise<ApiKey>;

  /**
   * Build a non-persisted entity from a partial payload. Mirrors
   * `Repository<ApiKey>.create` — exists so command-side services
   * never need direct access to the entity constructor.
   */
  abstract createEntity(data: Partial<ApiKey>): ApiKey;

  /**
   * Permanently delete a single entity. Mirrors
   * `Repository<ApiKey>.remove` — used by `revoke` (HIGH-severity
   * audit emission happens BEFORE this call in the legacy service;
   * Step 3 moves the ordering into the command service).
   */
  abstract remove(entity: ApiKey): Promise<void>;

  /**
   * Bulk hard-delete by primary key. Used by the cleanup cron's
   * purge job. The impl issues a single `DELETE … WHERE id = ANY(…)`
   * so 1000-row batches do not generate 1000 round-trips.
   */
  abstract batchDelete(ids: readonly string[]): Promise<void>;

  /**
   * Stamp `lastUsedAt` on a successful validation. Best-effort:
   * callers MUST suppress errors here (the legacy guard does
   * `.catch(() => {})`) so a stuck DB connection never rejects a
   * legitimate request.
   */
  abstract updateLastUsed(id: string, timestamp: Date): Promise<void>;

  /**
   * Stamp `unusedNotifiedAt` after the unused-key notification
   * dispatch succeeds. Single-column update so the cron does not have
   * to load the full entity into memory.
   */
  abstract markUnusedNotified(id: string, timestamp: Date): Promise<void>;

  // ---------------------------------------------------------------------------
  // Transaction
  // ---------------------------------------------------------------------------

  /**
   * Atomic key rotation. Replaces the two-step
   * `save(newKey) … save(oldKey)` sequence in the legacy service,
   * closing the crash window where a process death between the two
   * writes would leave the new key live AND the old key un-revoked.
   *
   * Semantics:
   *  - Opens its own `QueryRunner`.
   *  - Re-fetches the old key via the runner's manager (so the read
   *    joins the same transaction as the writes).
   *  - Persists `newEntity` (assigning its id), then updates the old
   *    key's `revokeAt` + `rotatedToKeyId` and persists it.
   *  - Commits iff both saves succeed; otherwise rolls back and
   *    propagates the error.
   *  - The `QueryRunner` is ALWAYS released in `finally`.
   *
   * Throws if `oldId` does not resolve inside the transaction —
   * callers must perform the ownership / `isActive` guard against
   * `findOneActiveByIdForUser` BEFORE invoking this.
   */
  abstract rotateInTransaction(
    oldId: string,
    newEntity: ApiKey,
    revokeAt: Date,
  ): Promise<RotateInTransactionResult>;
}

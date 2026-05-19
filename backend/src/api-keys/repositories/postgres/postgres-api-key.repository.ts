import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { ApiKey } from '../../entities/api-key.entity';
import {
  AbstractApiKeyRepository,
  ActiveApiKeyRow,
  ExpiredApiKeyRow,
  RotateInTransactionResult,
} from '../abstract/api-key.repository.abstract';

/**
 * Postgres API Key Repository
 *
 * The ONLY class — inside or outside the api-keys module — that owns
 * TypeORM's `Repository<ApiKey>` and `DataSource`. Every other
 * consumer (services, controllers, guards, listeners, cron workers)
 * must depend on `AbstractApiKeyRepository`, so the ORM and
 * transaction strategy can be swapped without touching domain logic.
 *
 * Query-shape notes
 * -----------------
 *  - `findByKeyPrefixActive` eager-loads `user` and `project` because
 *    the validator hydrates `ValidatedApiKey.organizationId` from
 *    `user.organizationId` and the audit emission carries the joined
 *    `project` summary. This is the single read on the hot
 *    authentication path — every milliseconds counts, so the prefix
 *    column already has a partial index in the migration.
 *  - `findAllByUserId` orders newest-first, matching the legacy
 *    `findAll` controller contract.
 *  - `findUnusedCandidates` uses a query builder because the
 *    `(lastUsedAt IS NULL OR lastUsedAt < cutoff)` clause cannot be
 *    expressed via the simple `where` object shape.
 *  - `findExpiredBefore` and `findAllActive` apply `.select([...])`
 *    so cleanup batches stay bandwidth-efficient. Their return
 *    Picks make the column projection enforceable at the type level
 *    — callers cannot reach for `keyHash` or relations even by
 *    accident.
 *
 * Transaction semantics for `rotateInTransaction`
 * -----------------------------------------------
 *  - Opens a single `QueryRunner`; re-fetches the old key through
 *    `manager.findOne(ApiKey, …)` so the read joins the same
 *    transaction as the writes.
 *  - Persists the new entity first to obtain its id, then updates
 *    the old entity's `revokeAt` + `rotatedToKeyId` and persists it.
 *    Both writes happen on the same `manager`, so the rollback is
 *    atomic.
 *  - Throws if `oldId` does not resolve inside the transaction
 *    (defence-in-depth — callers MUST gate this with
 *    `findOneActiveByIdForUser` first; the throw exists to catch
 *    races where the row vanishes between the guard and the
 *    transaction).
 *  - The `QueryRunner` is ALWAYS released in `finally`, matching the
 *    `bulkCreateInTransaction` pattern in
 *    `PostgresInviteRepository`.
 */
@Injectable()
export class PostgresApiKeyRepository extends AbstractApiKeyRepository {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  // ---------------------------------------------------------------------------
  // Reads — command & query paths
  // ---------------------------------------------------------------------------

  async findById(id: string): Promise<ApiKey | null> {
    return this.apiKeyRepo.findOne({ where: { id } });
  }

  async findOneByIdForUser(
    id: string,
    userId: string,
  ): Promise<ApiKey | null> {
    return this.apiKeyRepo.findOne({ where: { id, userId } });
  }

  async findOneActiveByIdForUser(
    id: string,
    userId: string,
  ): Promise<ApiKey | null> {
    return this.apiKeyRepo.findOne({
      where: { id, userId, isActive: true },
    });
  }

  async findAllByUserId(userId: string): Promise<ApiKey[]> {
    return this.apiKeyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByKeyPrefixActive(keyPrefix: string): Promise<ApiKey[]> {
    return this.apiKeyRepo.find({
      where: { keyPrefix, isActive: true },
      relations: ['user', 'project'],
    });
  }

  // ---------------------------------------------------------------------------
  // Reads — cleanup cron paths (narrowed projections)
  // ---------------------------------------------------------------------------

  async findExpiredBefore(
    cutoff: Date,
    batchSize: number,
  ): Promise<ExpiredApiKeyRow[]> {
    return this.apiKeyRepo.find({
      where: { revokeAt: LessThan(cutoff) },
      take: batchSize,
      select: ['id', 'keyPrefix', 'userId', 'revokeAt'],
    });
  }

  async findUnusedCandidates(cutoff: Date, cap: number): Promise<ApiKey[]> {
    return this.apiKeyRepo
      .createQueryBuilder('key')
      .where('key.createdAt < :cutoff', { cutoff })
      .andWhere('key.isActive = :isActive', { isActive: true })
      .andWhere('key.unusedNotifiedAt IS NULL')
      .andWhere('(key.lastUsedAt IS NULL OR key.lastUsedAt < :cutoff)', {
        cutoff,
      })
      .orderBy('key.createdAt', 'ASC')
      .take(cap)
      .getMany();
  }

  async findAllActive(): Promise<ActiveApiKeyRow[]> {
    return this.apiKeyRepo.find({
      where: { isActive: true },
      select: ['id', 'keyPrefix', 'userId', 'rateLimit'],
    });
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async save(entity: ApiKey): Promise<ApiKey> {
    return this.apiKeyRepo.save(entity);
  }

  createEntity(data: Partial<ApiKey>): ApiKey {
    return this.apiKeyRepo.create(data);
  }

  async remove(entity: ApiKey): Promise<void> {
    await this.apiKeyRepo.remove(entity);
  }

  async batchDelete(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.apiKeyRepo.delete([...ids]);
  }

  async updateLastUsed(id: string, timestamp: Date): Promise<void> {
    await this.apiKeyRepo.update(id, { lastUsedAt: timestamp });
  }

  async markUnusedNotified(id: string, timestamp: Date): Promise<void> {
    await this.apiKeyRepo.update(id, { unusedNotifiedAt: timestamp });
  }

  // ---------------------------------------------------------------------------
  // Transaction
  // ---------------------------------------------------------------------------

  async rotateInTransaction(
    oldId: string,
    newEntity: ApiKey,
    revokeAt: Date,
  ): Promise<RotateInTransactionResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const oldKey = await queryRunner.manager.findOne(ApiKey, {
        where: { id: oldId },
      });
      if (!oldKey) {
        throw new Error(
          `API key ${oldId} not found inside rotation transaction`,
        );
      }

      const savedNewKey = await queryRunner.manager.save(ApiKey, newEntity);

      oldKey.revokeAt = revokeAt;
      oldKey.rotatedToKeyId = savedNewKey.id;
      const savedOldKey = await queryRunner.manager.save(ApiKey, oldKey);

      await queryRunner.commitTransaction();
      return { oldKey: savedOldKey, newKey: savedNewKey };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

// src/revisions/revisions.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Revision, EntityType } from './entities/revision.entity';
import { Repository, EntityTarget, ObjectLiteral, In } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { Issue } from '../issues/entities/issue.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Board } from '../boards/entities/board.entity';
import { Release } from '../releases/entities/release.entity';
import { Label } from '../taxonomy/entities/label.entity';
import { Component } from '../taxonomy/entities/component.entity';
import { DiffService, RevisionDiff } from './services/diff.service';
import { ComparisonResponseDto } from './dto/comparison.dto';

/**
 * Maximum entity IDs per IN (...) clause chunk.
 *
 * PostgreSQL supports up to 65,535 parameterized placeholders ($1-$65535).
 * We chunk at 500 to keep query plans efficient — large IN lists degrade
 * planner performance above ~1000 entries. Chunks execute in parallel via
 * Promise.all() for maximum throughput.
 */
const BATCH_CHUNK_SIZE = 500;

/**
 * Per-entity-type metadata for tenant isolation.
 *
 * `Project` is anchored directly on `organizationId`; every other tracked
 * entity type lives under a `projectId` whose project carries the org.
 * The org-resolution query joins through `projects` to enforce isolation.
 */
const ENTITY_ORG_RESOLUTION: Record<
  EntityType,
  { table: string; projectColumn: 'organizationId' | 'projectId' }
> = {
  Project: { table: 'projects', projectColumn: 'organizationId' },
  Issue: { table: 'issues', projectColumn: 'projectId' },
  Sprint: { table: 'sprints', projectColumn: 'projectId' },
  Board: { table: 'boards', projectColumn: 'projectId' },
  Release: { table: 'releases', projectColumn: 'projectId' },
  Label: { table: 'labels', projectColumn: 'projectId' },
  Component: { table: 'components', projectColumn: 'projectId' },
};

@Injectable()
export class RevisionsService {
  private readonly logger = new Logger(RevisionsService.name);

  constructor(
    @InjectRepository(Revision)
    private revRepo: Repository<Revision>,
    private readonly diffService: DiffService,
  ) {}

  /**
   * Resolve the organizationId that owns a given entity.
   *
   * SECURITY: Used as a preflight check on every read/write path so
   * a tenant can never address revisions of another tenant's entity.
   *
   * Returns null if the entity doesn't exist (callers should treat as 404).
   */
  private async resolveEntityOrgId(
    type: EntityType,
    entityId: string,
  ): Promise<string | null> {
    const meta = ENTITY_ORG_RESOLUTION[type];
    if (!meta) {
      throw new BadRequestException(`Unsupported entity type: ${type}`);
    }

    const manager = this.revRepo.manager;

    if (meta.projectColumn === 'organizationId') {
      const row: { organizationId: string | null } | undefined = await manager
        .createQueryBuilder()
        .select('p."organizationId"', 'organizationId')
        .from(meta.table, 'p')
        .where('p.id = :id', { id: entityId })
        .getRawOne();
      return row?.organizationId ?? null;
    }

    const row: { organizationId: string | null } | undefined = await manager
      .createQueryBuilder()
      .select('proj."organizationId"', 'organizationId')
      .from(meta.table, 'e')
      .innerJoin('projects', 'proj', 'proj.id = e."projectId"')
      .where('e.id = :id', { id: entityId })
      .getRawOne();
    return row?.organizationId ?? null;
  }

  /**
   * Assert the caller's org matches the entity's owning org.
   * Throws NotFound (entity missing) or Forbidden (cross-tenant).
   */
  private async assertTenantAccess(
    type: EntityType,
    entityId: string,
    organizationId: string,
  ): Promise<void> {
    const ownerOrgId = await this.resolveEntityOrgId(type, entityId);
    if (ownerOrgId === null) {
      throw new NotFoundException(`${type} not found`);
    }
    if (ownerOrgId !== organizationId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }

  /** List revisions for a given entity (tenant-isolated). */
  async list(
    type: EntityType,
    entityId: string,
    organizationId: string,
  ): Promise<Revision[]> {
    await this.assertTenantAccess(type, entityId, organizationId);
    return this.revRepo.find({
      where: { entityType: type, entityId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Batch-fetch revisions for multiple entities in chunked queries.
   *
   * PERFORMANCE (Analytics N+1 Fix):
   * Replaces per-entity revision fetching (100 issues = 100 queries)
   * with chunked batch queries (100 issues = 1 query).
   *
   * NOTE: Internal/analytics path. Tenant isolation is the caller's
   * responsibility — IDs must already be filtered to the active tenant.
   */
  async listBatch(
    entityType: EntityType,
    entityIds: string[],
  ): Promise<Revision[]> {
    if (entityIds.length === 0) {
      return [];
    }

    const uniqueIds = [...new Set(entityIds)];

    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += BATCH_CHUNK_SIZE) {
      chunks.push(uniqueIds.slice(i, i + BATCH_CHUNK_SIZE));
    }

    this.logger.debug(
      `listBatch: Fetching revisions for ${uniqueIds.length} entities in ${chunks.length} chunk(s)`,
    );

    const chunkResults: Revision[][] = await Promise.all(
      chunks.map((chunkIds) =>
        this.revRepo.find({
          where: {
            entityType,
            entityId: In(chunkIds),
          },
          order: { createdAt: 'DESC' },
        }),
      ),
    );

    return chunkResults.flat();
  }

  /** Roll back to a given revision snapshot (tenant-isolated). */
  async rollback(
    type: EntityType,
    entityId: string,
    revisionId: string,
    organizationId: string,
  ): Promise<ObjectLiteral> {
    await this.assertTenantAccess(type, entityId, organizationId);

    const rev = await this.revRepo.findOneBy({ id: revisionId });
    if (!rev || rev.entityType !== type || rev.entityId !== entityId) {
      throw new NotFoundException('Revision not found');
    }

    const entityClassMap: Record<EntityType, EntityTarget<ObjectLiteral>> = {
      Project,
      Issue,
      Sprint,
      Board,
      Release,
      Label,
      Component,
    };
    const entityClass = entityClassMap[type];
    if (!entityClass)
      throw new Error(
        `Entity class for type '${type}' not implemented in rollback`,
      );

    const repo = this.revRepo.manager.getRepository(entityClass);
    await repo.save(rev.snapshot as ObjectLiteral);

    return rev.snapshot as ObjectLiteral;
  }

  /** Find the last revision for a specific field of an entity before a given date */
  async findLastRevisionForFieldBeforeDate(
    type: EntityType,
    entityId: string,
    field: string,
    date: Date,
  ): Promise<Revision | null> {
    const revision = await this.revRepo
      .createQueryBuilder('revision')
      .where('revision.entityType = :type', { type })
      .andWhere('revision.entityId = :entityId', { entityId })
      .andWhere('revision.field = :field', { field })
      .andWhere('revision.createdAt < :date', { date })
      .orderBy('revision.createdAt', 'DESC')
      .getOne();

    return revision;
  }

  /**
   * Get diff for a specific revision compared to its predecessor.
   * Returns human-readable changes.
   */
  async getDiff(revisionId: string): Promise<RevisionDiff | null> {
    const revision = await this.revRepo.findOneBy({ id: revisionId });
    if (!revision) {
      throw new NotFoundException('Revision not found');
    }

    if (revision.action === 'CREATE') {
      return this.diffService.computeDiff(
        null,
        revision.snapshot as Record<string, unknown>,
        revision.entityType,
        revision.changedBy,
        revision.createdAt,
      );
    }

    if (revision.action === 'DELETE') {
      return this.diffService.computeDiff(
        revision.snapshot as Record<string, unknown>,
        null,
        revision.entityType,
        revision.changedBy,
        revision.createdAt,
      );
    }

    const previousRevision = await this.revRepo
      .createQueryBuilder('revision')
      .where('revision.entityType = :type', { type: revision.entityType })
      .andWhere('revision.entityId = :entityId', {
        entityId: revision.entityId,
      })
      .andWhere('revision.createdAt < :date', { date: revision.createdAt })
      .orderBy('revision.createdAt', 'DESC')
      .getOne();

    const before = previousRevision?.snapshot as Record<string, unknown> | null;
    const after = revision.snapshot as Record<string, unknown>;

    return this.diffService.computeDiff(
      before,
      after,
      revision.entityType,
      revision.changedBy,
      revision.createdAt,
    );
  }

  /**
   * Get activity history with human-readable diffs for an entity (tenant-isolated).
   */
  async getHistory(
    type: EntityType,
    entityId: string,
    organizationId: string,
    limit = 20,
  ): Promise<RevisionDiff[]> {
    await this.assertTenantAccess(type, entityId, organizationId);

    const revisions = await this.revRepo.find({
      where: { entityType: type, entityId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    const diffs: RevisionDiff[] = [];

    for (let i = 0; i < revisions.length; i++) {
      const current = revisions[i];
      const previous = revisions[i + 1];

      if (current.action === 'CREATE') {
        diffs.push(
          this.diffService.computeDiff(
            null,
            current.snapshot as Record<string, unknown>,
            current.entityType,
            current.changedBy,
            current.createdAt,
          ),
        );
      } else if (current.action === 'DELETE') {
        diffs.push(
          this.diffService.computeDiff(
            current.snapshot as Record<string, unknown>,
            null,
            current.entityType,
            current.changedBy,
            current.createdAt,
          ),
        );
      } else {
        const before = previous?.snapshot as Record<string, unknown> | null;
        const after = current.snapshot as Record<string, unknown>;

        diffs.push(
          this.diffService.computeDiff(
            before,
            after,
            current.entityType,
            current.changedBy,
            current.createdAt,
          ),
        );
      }
    }

    return diffs;
  }

  /**
   * Fetch a single revision (tenant-isolated).
   * Verifies the caller owns the entity that the revision belongs to.
   */
  async getRevision(
    type: EntityType,
    entityId: string,
    revisionId: string,
    organizationId: string,
  ): Promise<Revision> {
    await this.assertTenantAccess(type, entityId, organizationId);

    const rev = await this.revRepo.findOneBy({ id: revisionId });
    if (!rev || rev.entityType !== type || rev.entityId !== entityId) {
      throw new NotFoundException('Revision not found');
    }
    return rev;
  }

  /**
   * Compare two revisions of the same entity (tenant-isolated).
   *
   * Both revisions must belong to the same entity, and the entity must be
   * owned by the caller's organization. The diff is produced by DiffService
   * using older → newer chronological order.
   */
  async compareRevisions(
    type: EntityType,
    entityId: string,
    revisionAId: string,
    revisionBId: string,
    organizationId: string,
  ): Promise<ComparisonResponseDto> {
    if (revisionAId === revisionBId) {
      throw new BadRequestException('Cannot compare a revision with itself');
    }

    await this.assertTenantAccess(type, entityId, organizationId);

    const revs = await this.revRepo.find({
      where: { id: In([revisionAId, revisionBId]) },
    });

    if (revs.length !== 2) {
      throw new NotFoundException('One or both revisions not found');
    }

    for (const rev of revs) {
      if (rev.entityType !== type || rev.entityId !== entityId) {
        throw new NotFoundException('Revision does not belong to this entity');
      }
    }

    const [older, newer] =
      revs[0].createdAt.getTime() <= revs[1].createdAt.getTime()
        ? [revs[0], revs[1]]
        : [revs[1], revs[0]];

    const before = older.snapshot as Record<string, unknown> | null;
    const after = newer.snapshot as Record<string, unknown> | null;

    const diff = this.diffService.computeDiff(
      before,
      after,
      type,
      newer.changedBy,
      newer.createdAt,
    );

    return {
      from: {
        id: older.id,
        entityType: older.entityType,
        entityId: older.entityId,
        action: older.action,
        changedBy: older.changedBy,
        createdAt: older.createdAt,
      },
      to: {
        id: newer.id,
        entityType: newer.entityType,
        entityId: newer.entityId,
        action: newer.action,
        changedBy: newer.changedBy,
        createdAt: newer.createdAt,
      },
      entityType: type,
      entityId,
      changes: diff.changes,
      summary: diff.summary,
    };
  }
}

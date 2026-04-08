// src/revisions/revisions.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
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
import { Logger } from '@nestjs/common';

/**
 * Maximum entity IDs per IN (...) clause chunk.
 *
 * PostgreSQL supports up to 65,535 parameterized placeholders ($1-$65535).
 * We chunk at 500 to keep query plans efficient — large IN lists degrade
 * planner performance above ~1000 entries. Chunks execute in parallel via
 * Promise.all() for maximum throughput.
 */
const BATCH_CHUNK_SIZE = 500;

@Injectable()
export class RevisionsService {
  private readonly logger = new Logger(RevisionsService.name);

  constructor(
    @InjectRepository(Revision)
    private revRepo: Repository<Revision>,
    private readonly diffService: DiffService,
  ) {}

  /** List revisions for a given entity */
  async list(type: EntityType, entityId: string): Promise<Revision[]> {
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
   * SAFETY:
   * - Chunks entityIds into groups of BATCH_CHUNK_SIZE (500) to prevent
   *   PostgreSQL parameter limit crashes (max 65,535 params).
   * - Returns empty array for empty input (no wasted query).
   * - Chunks execute in parallel via Promise.all().
   *
   * @param entityType - The entity type to fetch revisions for
   * @param entityIds  - Array of entity UUIDs (can be any size)
   * @returns Combined Revision[] sorted by createdAt DESC
   */
  async listBatch(
    entityType: EntityType,
    entityIds: string[],
  ): Promise<Revision[]> {
    if (entityIds.length === 0) {
      return [];
    }

    // Deduplicate IDs to prevent redundant DB work
    const uniqueIds = [...new Set(entityIds)];

    // Chunk into groups of BATCH_CHUNK_SIZE for safe IN clause usage
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += BATCH_CHUNK_SIZE) {
      chunks.push(uniqueIds.slice(i, i + BATCH_CHUNK_SIZE));
    }

    this.logger.debug(
      `listBatch: Fetching revisions for ${uniqueIds.length} entities in ${chunks.length} chunk(s)`,
    );

    // Execute all chunks in parallel
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

    // Flatten results from all chunks
    return chunkResults.flat();
  }

  /** Roll back to a given revision snapshot */
  async rollback(
    type: EntityType,
    entityId: string,
    revisionId: string,
  ): Promise<ObjectLiteral> {
    const rev = await this.revRepo.findOneBy({ id: revisionId });
    if (!rev || rev.entityType !== type || rev.entityId !== entityId) {
      throw new NotFoundException('Revision not found');
    }

    // Map EntityType to entity class
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

    // Dynamically get repository
    const repo = this.revRepo.manager.getRepository(entityClass);

    // Overwrite the current entity with snapshot
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
   * Get diff for a specific revision compared to its predecessor
   * Returns human-readable changes
   */
  async getDiff(revisionId: string): Promise<RevisionDiff | null> {
    const revision = await this.revRepo.findOneBy({ id: revisionId });
    if (!revision) {
      throw new NotFoundException('Revision not found');
    }

    // For CREATE actions, there's no before state
    if (revision.action === 'CREATE') {
      return this.diffService.computeDiff(
        null,
        revision.snapshot as Record<string, unknown>,
        revision.entityType,
        revision.changedBy,
        revision.createdAt,
      );
    }

    // For DELETE actions, there's no after state
    if (revision.action === 'DELETE') {
      return this.diffService.computeDiff(
        revision.snapshot as Record<string, unknown>,
        null,
        revision.entityType,
        revision.changedBy,
        revision.createdAt,
      );
    }

    // For UPDATE actions, find the previous revision to compare
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
   * Get activity history with human-readable diffs for an entity
   * Returns ordered list of diffs for activity feed display
   */
  async getHistory(
    type: EntityType,
    entityId: string,
    limit = 20,
  ): Promise<RevisionDiff[]> {
    const revisions = await this.revRepo.find({
      where: { entityType: type, entityId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    const diffs: RevisionDiff[] = [];

    for (let i = 0; i < revisions.length; i++) {
      const current = revisions[i];
      const previous = revisions[i + 1]; // Next in array is previous in time

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
        // UPDATE - compare with previous revision
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
}

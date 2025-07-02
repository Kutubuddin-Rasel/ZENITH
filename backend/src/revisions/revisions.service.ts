// src/revisions/revisions.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Revision, EntityType } from './entities/revision.entity';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { Issue } from '../issues/entities/issue.entity';
// TODO: Import other entities as needed (Sprint, Board, Release, Label, Component, Epic, Story)

@Injectable()
export class RevisionsService {
  constructor(
    @InjectRepository(Revision)
    private revRepo: Repository<Revision>,
  ) {}

  /** List revisions for a given entity */
  async list(type: EntityType, entityId: string): Promise<Revision[]> {
    return this.revRepo.find({
      where: { entityType: type, entityId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Roll back to a given revision snapshot */
  async rollback(
    type: EntityType,
    entityId: string,
    revisionId: string,
  ): Promise<any> {
    const rev = await this.revRepo.findOneBy({ id: revisionId });
    if (!rev || rev.entityType !== type || rev.entityId !== entityId) {
      throw new NotFoundException('Revision not found');
    }

    // Map EntityType to entity class
    const entityClassMap: Record<EntityType, any> = {
      Project,
      Issue,
      // TODO: Add other entity mappings here
      Sprint: undefined,
      Board: undefined,
      Release: undefined,
      Label: undefined,
      Component: undefined,
      Epic: undefined,
      Story: undefined,
    };
    const entityClass = entityClassMap[type];
    if (!entityClass)
      throw new Error(
        `Entity class for type '${type}' not implemented in rollback`,
      );

    // Dynamically get repository
    const repo = this.revRepo.manager.getRepository(entityClass);

    // Overwrite the current entity with snapshot
    await repo.save(rev.snapshot);

    return rev.snapshot;
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
}

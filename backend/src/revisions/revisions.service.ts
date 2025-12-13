// src/revisions/revisions.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Revision, EntityType } from './entities/revision.entity';
import { Repository, EntityTarget, ObjectLiteral } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { Issue } from '../issues/entities/issue.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Board } from '../boards/entities/board.entity';
import { Release } from '../releases/entities/release.entity';
import { Label } from '../taxonomy/entities/label.entity';
import { Component } from '../taxonomy/entities/component.entity';

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
}

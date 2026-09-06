import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SaveOptions,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { Revision } from '../../../revisions/entities/revision.entity';
import { RevisionRepository } from '../revision.repository';

/**
 * TypeORM-backed `Revision` repository — narrow surface for the
 * projects activity feed (Step 2 closes the
 * `DataSource.getRepository(Revision)` leak inside `ProjectsService`).
 *
 * Encapsulation
 * -------------
 * The JSONB path predicate `snapshot::jsonb ->> 'projectId'` lives
 * here, NOT in the service layer. Callers pass a plain `projectId`
 * and receive the typed entity rows back; the raw SQL fragment is
 * private to this implementation.
 *
 * Safety clamp: `limit` is hard-capped at `MAX_LIMIT` (200) inside
 * the impl to prevent runaway scans if a caller forgets to bound the
 * page size (BaseRepository contract: "callers MUST paginate large
 * reads" — we enforce that here for the activity feed specifically).
 *
 * INTERNAL ONLY. Not exported from `DatabaseModule` — consumers
 * depend on the abstract `RevisionRepository` token (DIP).
 *
 * Revisions are immutable audit history: `remove`, `softRemove`, and
 * `restore` are part of the inherited `BaseRepository` surface but
 * MUST NOT be invoked.
 */
@Injectable()
export class TypeOrmRevisionRepository extends RevisionRepository {
  private static readonly MAX_LIMIT = 200;

  constructor(
    @InjectRepository(Revision)
    private readonly repo: Repository<Revision>,
  ) {
    super();
  }

  findByProjectId(projectId: string, limit: number): Promise<Revision[]> {
    const clampedLimit = Math.max(
      1,
      Math.min(limit, TypeOrmRevisionRepository.MAX_LIMIT),
    );
    return this.repo
      .createQueryBuilder('revision')
      .where(`revision.snapshot::jsonb ->> 'projectId' = :projectId`, {
        projectId,
      })
      .orderBy('revision.createdAt', 'DESC')
      .limit(clampedLimit)
      .getMany();
  }

  findById(id: string): Promise<Revision | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<Revision>,
    });
  }

  findOne(options: FindOneOptions<Revision>): Promise<Revision | null> {
    return this.repo.findOne(options);
  }

  findMany(options?: FindManyOptions<Revision>): Promise<Revision[]> {
    return this.repo.find(options);
  }

  findAndCount(
    options?: FindManyOptions<Revision>,
  ): Promise<[Revision[], number]> {
    return this.repo.findAndCount(options);
  }

  count(where?: FindOptionsWhere<Revision>): Promise<number> {
    return this.repo.count({ where });
  }

  exists(where: FindOptionsWhere<Revision>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  create(data: DeepPartial<Revision>): Revision {
    return this.repo.create(data);
  }

  save(data: DeepPartial<Revision>, options?: SaveOptions): Promise<Revision> {
    return this.repo.save(data, options);
  }

  saveMany(
    data: DeepPartial<Revision>[],
    options?: SaveOptions,
  ): Promise<Revision[]> {
    return this.repo.save(data, options);
  }

  async update(
    id: string,
    patch: QueryDeepPartialEntity<Revision>,
  ): Promise<void> {
    await this.repo.update(id, patch);
  }

  remove(entity: Revision): Promise<Revision> {
    return this.repo.remove(entity);
  }

  softRemove(entity: Revision): Promise<Revision> {
    return this.repo.softRemove(entity);
  }

  async restore(id: string): Promise<void> {
    await this.repo.restore(id);
  }
}

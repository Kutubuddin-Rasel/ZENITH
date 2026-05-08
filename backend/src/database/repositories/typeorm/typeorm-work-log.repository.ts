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

import { WorkLog } from '../../../issues/entities/work-log.entity';
import { WorkLogRepository } from '../work-log.repository';
import { mergeWhere } from './where-merge.helper';

/**
 * TypeORM-backed WorkLog repository.
 *
 * INTERNAL ONLY. Not exported from `DatabaseModule`.
 */
@Injectable()
export class TypeOrmWorkLogRepository extends WorkLogRepository {
  constructor(
    @InjectRepository(WorkLog)
    private readonly repo: Repository<WorkLog>,
  ) {
    super();
  }

  findById(id: string): Promise<WorkLog | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<WorkLog>,
    });
  }

  findOne(options: FindOneOptions<WorkLog>): Promise<WorkLog | null> {
    return this.repo.findOne(options);
  }

  findMany(options?: FindManyOptions<WorkLog>): Promise<WorkLog[]> {
    return this.repo.find(options);
  }

  findAndCount(
    options?: FindManyOptions<WorkLog>,
  ): Promise<[WorkLog[], number]> {
    return this.repo.findAndCount(options);
  }

  findByIssue(
    issueId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]> {
    return this.repo.find({
      ...options,
      where: mergeWhere<WorkLog>(options?.where, { issueId }),
    });
  }

  findByUser(
    userId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]> {
    return this.repo.find({
      ...options,
      where: mergeWhere<WorkLog>(options?.where, { userId }),
    });
  }

  findByProject(
    projectId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]> {
    return this.repo.find({
      ...options,
      where: mergeWhere<WorkLog>(options?.where, { projectId }),
    });
  }

  count(where?: FindOptionsWhere<WorkLog>): Promise<number> {
    return this.repo.count({ where });
  }

  exists(where: FindOptionsWhere<WorkLog>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  create(data: DeepPartial<WorkLog>): WorkLog {
    return this.repo.create(data);
  }

  save(
    data: DeepPartial<WorkLog>,
    options?: SaveOptions,
  ): Promise<WorkLog> {
    return this.repo.save(data, options);
  }

  saveMany(
    data: DeepPartial<WorkLog>[],
    options?: SaveOptions,
  ): Promise<WorkLog[]> {
    return this.repo.save(data, options);
  }

  async update(
    id: string,
    patch: QueryDeepPartialEntity<WorkLog>,
  ): Promise<void> {
    await this.repo.update(id, patch);
  }

  remove(entity: WorkLog): Promise<WorkLog> {
    return this.repo.remove(entity);
  }

  softRemove(entity: WorkLog): Promise<WorkLog> {
    return this.repo.softRemove(entity);
  }

  async restore(id: string): Promise<void> {
    await this.repo.restore(id);
  }
}

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

import { Issue } from '../../../issues/entities/issue.entity';
import { IssueRepository } from '../issue.repository';
import { mergeWhere } from './where-merge.helper';

/**
 * TypeORM-backed Issue repository.
 *
 * INTERNAL ONLY. Not exported from `DatabaseModule` — consumers depend on the
 * abstract `IssueRepository` token.
 */
@Injectable()
export class TypeOrmIssueRepository extends IssueRepository {
  constructor(
    @InjectRepository(Issue)
    private readonly repo: Repository<Issue>,
  ) {
    super();
  }

  findById(id: string): Promise<Issue | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<Issue>,
    });
  }

  findOne(options: FindOneOptions<Issue>): Promise<Issue | null> {
    return this.repo.findOne(options);
  }

  findMany(options?: FindManyOptions<Issue>): Promise<Issue[]> {
    return this.repo.find(options);
  }

  findAndCount(
    options?: FindManyOptions<Issue>,
  ): Promise<[Issue[], number]> {
    return this.repo.findAndCount(options);
  }

  findByProject(
    projectId: string,
    options?: FindManyOptions<Issue>,
  ): Promise<Issue[]> {
    return this.repo.find({
      ...options,
      where: mergeWhere<Issue>(options?.where, { projectId }),
    });
  }

  count(where?: FindOptionsWhere<Issue>): Promise<number> {
    return this.repo.count({ where });
  }

  exists(where: FindOptionsWhere<Issue>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  create(data: DeepPartial<Issue>): Issue {
    return this.repo.create(data);
  }

  save(data: DeepPartial<Issue>, options?: SaveOptions): Promise<Issue> {
    return this.repo.save(data, options);
  }

  saveMany(
    data: DeepPartial<Issue>[],
    options?: SaveOptions,
  ): Promise<Issue[]> {
    return this.repo.save(data, options);
  }

  async update(
    id: string,
    patch: QueryDeepPartialEntity<Issue>,
  ): Promise<void> {
    await this.repo.update(id, patch);
  }

  remove(entity: Issue): Promise<Issue> {
    return this.repo.remove(entity);
  }

  softRemove(entity: Issue): Promise<Issue> {
    return this.repo.softRemove(entity);
  }

  async restore(id: string): Promise<void> {
    await this.repo.restore(id);
  }
}

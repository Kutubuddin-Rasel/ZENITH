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

import { IssueLink } from '../../../issues/entities/issue-link.entity';
import { IssueLinkRepository } from '../issue-link.repository';

/**
 * TypeORM-backed IssueLink repository.
 *
 * INTERNAL ONLY. Not exported from `DatabaseModule` — consumers depend on
 * the abstract `IssueLinkRepository` token.
 */
@Injectable()
export class TypeOrmIssueLinkRepository extends IssueLinkRepository {
  constructor(
    @InjectRepository(IssueLink)
    private readonly repo: Repository<IssueLink>,
  ) {
    super();
  }

  findById(id: string): Promise<IssueLink | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<IssueLink>,
    });
  }

  findOne(options: FindOneOptions<IssueLink>): Promise<IssueLink | null> {
    return this.repo.findOne(options);
  }

  findMany(options?: FindManyOptions<IssueLink>): Promise<IssueLink[]> {
    return this.repo.find(options);
  }

  findAndCount(
    options?: FindManyOptions<IssueLink>,
  ): Promise<[IssueLink[], number]> {
    return this.repo.findAndCount(options);
  }

  findForIssue(issueId: string): Promise<IssueLink[]> {
    return this.repo.find({
      where: [{ sourceIssueId: issueId }, { targetIssueId: issueId }],
      relations: ['sourceIssue', 'targetIssue'],
    });
  }

  count(where?: FindOptionsWhere<IssueLink>): Promise<number> {
    return this.repo.count({ where });
  }

  exists(where: FindOptionsWhere<IssueLink>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  create(data: DeepPartial<IssueLink>): IssueLink {
    return this.repo.create(data);
  }

  save(
    data: DeepPartial<IssueLink>,
    options?: SaveOptions,
  ): Promise<IssueLink> {
    return this.repo.save(data, options);
  }

  saveMany(
    data: DeepPartial<IssueLink>[],
    options?: SaveOptions,
  ): Promise<IssueLink[]> {
    return this.repo.save(data, options);
  }

  async update(
    id: string,
    patch: QueryDeepPartialEntity<IssueLink>,
  ): Promise<void> {
    await this.repo.update(id, patch);
  }

  remove(entity: IssueLink): Promise<IssueLink> {
    return this.repo.remove(entity);
  }

  softRemove(entity: IssueLink): Promise<IssueLink> {
    return this.repo.softRemove(entity);
  }

  async restore(id: string): Promise<void> {
    await this.repo.restore(id);
  }
}

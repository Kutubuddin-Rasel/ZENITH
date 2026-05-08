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

import { Project } from '../../../projects/entities/project.entity';
import { ProjectRepository } from '../project.repository';
import { mergeWhere } from './where-merge.helper';

/**
 * TypeORM-backed Project repository.
 *
 * Project is the ONLY Tier-1 aggregate with `@DeleteDateColumn` — `softRemove`
 * and `restore` set/clear `deletedAt` automatically.
 *
 * INTERNAL ONLY. Not exported from `DatabaseModule`.
 */
@Injectable()
export class TypeOrmProjectRepository extends ProjectRepository {
  constructor(
    @InjectRepository(Project)
    private readonly repo: Repository<Project>,
  ) {
    super();
  }

  findById(id: string): Promise<Project | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<Project>,
    });
  }

  findOne(options: FindOneOptions<Project>): Promise<Project | null> {
    return this.repo.findOne(options);
  }

  findMany(options?: FindManyOptions<Project>): Promise<Project[]> {
    return this.repo.find(options);
  }

  findAndCount(
    options?: FindManyOptions<Project>,
  ): Promise<[Project[], number]> {
    return this.repo.findAndCount(options);
  }

  findByKey(key: string): Promise<Project | null> {
    return this.repo.findOne({
      where: { key } as FindOptionsWhere<Project>,
    });
  }

  findByOrganization(
    organizationId: string,
    options?: FindManyOptions<Project>,
  ): Promise<Project[]> {
    return this.repo.find({
      ...options,
      where: mergeWhere<Project>(options?.where, { organizationId }),
    });
  }

  findForMember(userId: string, organizationId: string): Promise<Project[]> {
    return this.repo
      .createQueryBuilder('project')
      .innerJoin(
        'project_members',
        'pm',
        'pm.projectId = project.id AND pm.userId = :userId',
        { userId },
      )
      .where('project.isArchived = false')
      .andWhere('project.organizationId = :organizationId', { organizationId })
      .getMany();
  }

  count(where?: FindOptionsWhere<Project>): Promise<number> {
    return this.repo.count({ where });
  }

  exists(where: FindOptionsWhere<Project>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  create(data: DeepPartial<Project>): Project {
    return this.repo.create(data);
  }

  save(data: DeepPartial<Project>, options?: SaveOptions): Promise<Project> {
    return this.repo.save(data, options);
  }

  saveMany(
    data: DeepPartial<Project>[],
    options?: SaveOptions,
  ): Promise<Project[]> {
    return this.repo.save(data, options);
  }

  async update(
    id: string,
    patch: QueryDeepPartialEntity<Project>,
  ): Promise<void> {
    await this.repo.update(id, patch);
  }

  remove(entity: Project): Promise<Project> {
    return this.repo.remove(entity);
  }

  softRemove(entity: Project): Promise<Project> {
    return this.repo.softRemove(entity);
  }

  async restore(id: string): Promise<void> {
    await this.repo.restore(id);
  }
}

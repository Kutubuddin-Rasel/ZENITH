import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  EntityManager,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SaveOptions,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { ProjectAccessSettings } from '../../../projects/entities/project-access-settings.entity';
import { ProjectAccessSettingsRepository } from '../project-access-settings.repository';

/**
 * TypeORM-backed `ProjectAccessSettings` repository.
 *
 * INTERNAL ONLY. Not exported from `DatabaseModule` — consumers
 * depend on the abstract `ProjectAccessSettingsRepository` token
 * (DIP).
 *
 * No `@DeleteDateColumn` on `ProjectAccessSettings`: `softRemove`
 * and `restore` delegate to the underlying repo and will throw at
 * runtime if invoked. The abstract jsdoc warns against calling them.
 */
@Injectable()
export class TypeOrmProjectAccessSettingsRepository extends ProjectAccessSettingsRepository {
  constructor(
    @InjectRepository(ProjectAccessSettings)
    private readonly repo: Repository<ProjectAccessSettings>,
  ) {
    super();
  }

  findByProject(
    projectId: string,
    manager?: EntityManager,
  ): Promise<ProjectAccessSettings | null> {
    const repo = manager
      ? manager.getRepository(ProjectAccessSettings)
      : this.repo;
    return repo.findOne({ where: { projectId } });
  }

  findById(id: string): Promise<ProjectAccessSettings | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<ProjectAccessSettings>,
    });
  }

  findOne(
    options: FindOneOptions<ProjectAccessSettings>,
  ): Promise<ProjectAccessSettings | null> {
    return this.repo.findOne(options);
  }

  findMany(
    options?: FindManyOptions<ProjectAccessSettings>,
  ): Promise<ProjectAccessSettings[]> {
    return this.repo.find(options);
  }

  findAndCount(
    options?: FindManyOptions<ProjectAccessSettings>,
  ): Promise<[ProjectAccessSettings[], number]> {
    return this.repo.findAndCount(options);
  }

  count(where?: FindOptionsWhere<ProjectAccessSettings>): Promise<number> {
    return this.repo.count({ where });
  }

  exists(where: FindOptionsWhere<ProjectAccessSettings>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  create(data: DeepPartial<ProjectAccessSettings>): ProjectAccessSettings {
    return this.repo.create(data);
  }

  save(
    data: DeepPartial<ProjectAccessSettings>,
    options?: SaveOptions,
  ): Promise<ProjectAccessSettings> {
    return this.repo.save(data, options);
  }

  saveMany(
    data: DeepPartial<ProjectAccessSettings>[],
    options?: SaveOptions,
  ): Promise<ProjectAccessSettings[]> {
    return this.repo.save(data, options);
  }

  async update(
    id: string,
    patch: QueryDeepPartialEntity<ProjectAccessSettings>,
  ): Promise<void> {
    await this.repo.update(id, patch);
  }

  remove(entity: ProjectAccessSettings): Promise<ProjectAccessSettings> {
    return this.repo.remove(entity);
  }

  softRemove(entity: ProjectAccessSettings): Promise<ProjectAccessSettings> {
    return this.repo.softRemove(entity);
  }

  async restore(id: string): Promise<void> {
    await this.repo.restore(id);
  }
}

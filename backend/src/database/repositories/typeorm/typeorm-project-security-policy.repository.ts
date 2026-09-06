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

import { ProjectSecurityPolicy } from '../../../projects/entities/project-security-policy.entity';
import { ProjectSecurityPolicyRepository } from '../project-security-policy.repository';

/**
 * TypeORM-backed `ProjectSecurityPolicy` repository.
 *
 * INTERNAL ONLY. Not exported from `DatabaseModule` — consumers
 * depend on the abstract `ProjectSecurityPolicyRepository` token
 * (DIP).
 *
 * No `@DeleteDateColumn` on `ProjectSecurityPolicy`: `softRemove`
 * and `restore` delegate to the underlying repo and will throw at
 * runtime if invoked. The abstract jsdoc warns against calling them.
 */
@Injectable()
export class TypeOrmProjectSecurityPolicyRepository extends ProjectSecurityPolicyRepository {
  constructor(
    @InjectRepository(ProjectSecurityPolicy)
    private readonly repo: Repository<ProjectSecurityPolicy>,
  ) {
    super();
  }

  findByProject(
    projectId: string,
    manager?: EntityManager,
  ): Promise<ProjectSecurityPolicy | null> {
    const repo = manager
      ? manager.getRepository(ProjectSecurityPolicy)
      : this.repo;
    return repo.findOne({ where: { projectId } });
  }

  findById(id: string): Promise<ProjectSecurityPolicy | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<ProjectSecurityPolicy>,
    });
  }

  findOne(
    options: FindOneOptions<ProjectSecurityPolicy>,
  ): Promise<ProjectSecurityPolicy | null> {
    return this.repo.findOne(options);
  }

  findMany(
    options?: FindManyOptions<ProjectSecurityPolicy>,
  ): Promise<ProjectSecurityPolicy[]> {
    return this.repo.find(options);
  }

  findAndCount(
    options?: FindManyOptions<ProjectSecurityPolicy>,
  ): Promise<[ProjectSecurityPolicy[], number]> {
    return this.repo.findAndCount(options);
  }

  count(where?: FindOptionsWhere<ProjectSecurityPolicy>): Promise<number> {
    return this.repo.count({ where });
  }

  exists(where: FindOptionsWhere<ProjectSecurityPolicy>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  create(data: DeepPartial<ProjectSecurityPolicy>): ProjectSecurityPolicy {
    return this.repo.create(data);
  }

  save(
    data: DeepPartial<ProjectSecurityPolicy>,
    options?: SaveOptions,
  ): Promise<ProjectSecurityPolicy> {
    return this.repo.save(data, options);
  }

  saveMany(
    data: DeepPartial<ProjectSecurityPolicy>[],
    options?: SaveOptions,
  ): Promise<ProjectSecurityPolicy[]> {
    return this.repo.save(data, options);
  }

  async update(
    id: string,
    patch: QueryDeepPartialEntity<ProjectSecurityPolicy>,
  ): Promise<void> {
    await this.repo.update(id, patch);
  }

  remove(entity: ProjectSecurityPolicy): Promise<ProjectSecurityPolicy> {
    return this.repo.remove(entity);
  }

  softRemove(entity: ProjectSecurityPolicy): Promise<ProjectSecurityPolicy> {
    return this.repo.softRemove(entity);
  }

  async restore(id: string): Promise<void> {
    await this.repo.restore(id);
  }
}

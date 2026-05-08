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

import { User } from '../../../users/entities/user.entity';
import { UserRepository } from '../user.repository';

/**
 * TypeORM-backed User repository.
 *
 * INTERNAL ONLY. Not exported from `DatabaseModule`.
 */
@Injectable()
export class TypeOrmUserRepository extends UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {
    super();
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<User>,
    });
  }

  findOne(options: FindOneOptions<User>): Promise<User | null> {
    return this.repo.findOne(options);
  }

  findMany(options?: FindManyOptions<User>): Promise<User[]> {
    return this.repo.find(options);
  }

  findAndCount(
    options?: FindManyOptions<User>,
  ): Promise<[User[], number]> {
    return this.repo.findAndCount(options);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({
      where: { email } as FindOptionsWhere<User>,
    });
  }

  count(where?: FindOptionsWhere<User>): Promise<number> {
    return this.repo.count({ where });
  }

  exists(where: FindOptionsWhere<User>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  create(data: DeepPartial<User>): User {
    return this.repo.create(data);
  }

  save(data: DeepPartial<User>, options?: SaveOptions): Promise<User> {
    return this.repo.save(data, options);
  }

  saveMany(
    data: DeepPartial<User>[],
    options?: SaveOptions,
  ): Promise<User[]> {
    return this.repo.save(data, options);
  }

  async update(
    id: string,
    patch: QueryDeepPartialEntity<User>,
  ): Promise<void> {
    await this.repo.update(id, patch);
  }

  remove(entity: User): Promise<User> {
    return this.repo.remove(entity);
  }

  softRemove(entity: User): Promise<User> {
    return this.repo.softRemove(entity);
  }

  async restore(id: string): Promise<void> {
    await this.repo.restore(id);
  }
}

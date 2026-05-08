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

import { Board } from '../../../boards/entities/board.entity';
import { BoardRepository } from '../board.repository';
import { mergeWhere } from './where-merge.helper';

/**
 * TypeORM-backed Board repository.
 *
 * INTERNAL ONLY. Not exported from `DatabaseModule`.
 */
@Injectable()
export class TypeOrmBoardRepository extends BoardRepository {
  constructor(
    @InjectRepository(Board)
    private readonly repo: Repository<Board>,
  ) {
    super();
  }

  findById(id: string): Promise<Board | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<Board>,
    });
  }

  findOne(options: FindOneOptions<Board>): Promise<Board | null> {
    return this.repo.findOne(options);
  }

  findMany(options?: FindManyOptions<Board>): Promise<Board[]> {
    return this.repo.find(options);
  }

  findAndCount(
    options?: FindManyOptions<Board>,
  ): Promise<[Board[], number]> {
    return this.repo.findAndCount(options);
  }

  findByProject(
    projectId: string,
    options?: FindManyOptions<Board>,
  ): Promise<Board[]> {
    return this.repo.find({
      ...options,
      where: mergeWhere<Board>(options?.where, { projectId }),
    });
  }

  count(where?: FindOptionsWhere<Board>): Promise<number> {
    return this.repo.count({ where });
  }

  exists(where: FindOptionsWhere<Board>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  create(data: DeepPartial<Board>): Board {
    return this.repo.create(data);
  }

  save(data: DeepPartial<Board>, options?: SaveOptions): Promise<Board> {
    return this.repo.save(data, options);
  }

  saveMany(
    data: DeepPartial<Board>[],
    options?: SaveOptions,
  ): Promise<Board[]> {
    return this.repo.save(data, options);
  }

  async update(
    id: string,
    patch: QueryDeepPartialEntity<Board>,
  ): Promise<void> {
    await this.repo.update(id, patch);
  }

  remove(entity: Board): Promise<Board> {
    return this.repo.remove(entity);
  }

  softRemove(entity: Board): Promise<Board> {
    return this.repo.softRemove(entity);
  }

  async restore(id: string): Promise<void> {
    await this.repo.restore(id);
  }
}

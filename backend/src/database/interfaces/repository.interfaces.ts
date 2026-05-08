import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  SaveOptions,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { Issue } from '../../issues/entities/issue.entity';
import { WorkLog } from '../../issues/entities/work-log.entity';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { Board } from '../../boards/entities/board.entity';

/**
 * Role-segregated repository interfaces (ISP).
 *
 * Each aggregate exposes a `*Reader` (queries) and a `*Writer` (mutations) so
 * services depend ONLY on the methods they actually invoke. Concrete
 * `TypeOrm*Repository` classes (Step 2) implement BOTH the relevant
 * `BaseRepository<TEntity>` and the role interfaces below.
 *
 * Conventions:
 *  - PK is `string` (UUID) for every Tier-1 aggregate.
 *  - Reads return `null` (never `undefined`) when the row is absent.
 *  - Writers expose `softRemove`/`restore` ONLY for entities that declare
 *    `@DeleteDateColumn` (currently: Project).
 */

// =============================================================================
// Issue
// =============================================================================
export interface IIssueReader {
  findById(id: string): Promise<Issue | null>;
  findOne(options: FindOneOptions<Issue>): Promise<Issue | null>;
  findMany(options?: FindManyOptions<Issue>): Promise<Issue[]>;
  findAndCount(
    options?: FindManyOptions<Issue>,
  ): Promise<[Issue[], number]>;
  findByProject(
    projectId: string,
    options?: FindManyOptions<Issue>,
  ): Promise<Issue[]>;
  count(where?: FindOptionsWhere<Issue>): Promise<number>;
  exists(where: FindOptionsWhere<Issue>): Promise<boolean>;
}

export interface IIssueWriter {
  create(data: DeepPartial<Issue>): Issue;
  save(data: DeepPartial<Issue>, options?: SaveOptions): Promise<Issue>;
  saveMany(
    data: DeepPartial<Issue>[],
    options?: SaveOptions,
  ): Promise<Issue[]>;
  update(id: string, patch: QueryDeepPartialEntity<Issue>): Promise<void>;
  remove(entity: Issue): Promise<Issue>;
}

// =============================================================================
// Project (soft-deletable: @DeleteDateColumn deletedAt)
// =============================================================================
export interface IProjectReader {
  findById(id: string): Promise<Project | null>;
  findOne(options: FindOneOptions<Project>): Promise<Project | null>;
  findMany(options?: FindManyOptions<Project>): Promise<Project[]>;
  findAndCount(
    options?: FindManyOptions<Project>,
  ): Promise<[Project[], number]>;
  findBySlug(slug: string): Promise<Project | null>;
  findByOrganization(
    organizationId: string,
    options?: FindManyOptions<Project>,
  ): Promise<Project[]>;
  count(where?: FindOptionsWhere<Project>): Promise<number>;
  exists(where: FindOptionsWhere<Project>): Promise<boolean>;
}

export interface IProjectWriter {
  create(data: DeepPartial<Project>): Project;
  save(data: DeepPartial<Project>, options?: SaveOptions): Promise<Project>;
  saveMany(
    data: DeepPartial<Project>[],
    options?: SaveOptions,
  ): Promise<Project[]>;
  update(id: string, patch: QueryDeepPartialEntity<Project>): Promise<void>;
  softRemove(entity: Project): Promise<Project>;
  restore(id: string): Promise<void>;
}

// =============================================================================
// WorkLog
// =============================================================================
export interface IWorkLogReader {
  findById(id: string): Promise<WorkLog | null>;
  findOne(options: FindOneOptions<WorkLog>): Promise<WorkLog | null>;
  findMany(options?: FindManyOptions<WorkLog>): Promise<WorkLog[]>;
  findByIssue(
    issueId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]>;
  findByUser(
    userId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]>;
  findByProject(
    projectId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]>;
  count(where?: FindOptionsWhere<WorkLog>): Promise<number>;
  exists(where: FindOptionsWhere<WorkLog>): Promise<boolean>;
}

export interface IWorkLogWriter {
  create(data: DeepPartial<WorkLog>): WorkLog;
  save(data: DeepPartial<WorkLog>, options?: SaveOptions): Promise<WorkLog>;
  saveMany(
    data: DeepPartial<WorkLog>[],
    options?: SaveOptions,
  ): Promise<WorkLog[]>;
  update(id: string, patch: QueryDeepPartialEntity<WorkLog>): Promise<void>;
  remove(entity: WorkLog): Promise<WorkLog>;
}

// =============================================================================
// User
// =============================================================================
export interface IUserReader {
  findById(id: string): Promise<User | null>;
  findOne(options: FindOneOptions<User>): Promise<User | null>;
  findMany(options?: FindManyOptions<User>): Promise<User[]>;
  findByEmail(email: string): Promise<User | null>;
  count(where?: FindOptionsWhere<User>): Promise<number>;
  exists(where: FindOptionsWhere<User>): Promise<boolean>;
}

export interface IUserWriter {
  create(data: DeepPartial<User>): User;
  save(data: DeepPartial<User>, options?: SaveOptions): Promise<User>;
  saveMany(
    data: DeepPartial<User>[],
    options?: SaveOptions,
  ): Promise<User[]>;
  update(id: string, patch: QueryDeepPartialEntity<User>): Promise<void>;
  remove(entity: User): Promise<User>;
}

// =============================================================================
// Board
// =============================================================================
export interface IBoardReader {
  findById(id: string): Promise<Board | null>;
  findOne(options: FindOneOptions<Board>): Promise<Board | null>;
  findMany(options?: FindManyOptions<Board>): Promise<Board[]>;
  findByProject(
    projectId: string,
    options?: FindManyOptions<Board>,
  ): Promise<Board[]>;
  count(where?: FindOptionsWhere<Board>): Promise<number>;
  exists(where: FindOptionsWhere<Board>): Promise<boolean>;
}

export interface IBoardWriter {
  create(data: DeepPartial<Board>): Board;
  save(data: DeepPartial<Board>, options?: SaveOptions): Promise<Board>;
  saveMany(
    data: DeepPartial<Board>[],
    options?: SaveOptions,
  ): Promise<Board[]>;
  update(id: string, patch: QueryDeepPartialEntity<Board>): Promise<void>;
  remove(entity: Board): Promise<Board>;
}

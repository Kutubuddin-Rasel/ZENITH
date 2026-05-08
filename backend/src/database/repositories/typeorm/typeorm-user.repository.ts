import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SaveOptions,
  SelectQueryBuilder,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { User } from '../../../users/entities/user.entity';
import {
  UserMembershipProjectRef,
  UserSearchRow,
  UserWithMemberships,
} from '../../interfaces/repository.interfaces';
import { UserRepository } from '../user.repository';

interface RawMembershipRow {
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatarUrl: string;
  user_isActive: boolean;
  user_isSuperAdmin: boolean;
  user_defaultRole: string;
  pm_projectId: string | null;
  pm_roleName: string | null;
  project_id: string | null;
  project_name: string | null;
  project_key: string | null;
}

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

  findByVerificationToken(token: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.emailVerificationToken')
      .where('user.emailVerificationToken = :token', { token })
      .getOne();
  }

  async searchUsers(
    term: string,
    excludeProjectId?: string,
    organizationId?: string,
  ): Promise<UserSearchRow[]> {
    const qb = this.repo
      .createQueryBuilder('user')
      .select(['user.id', 'user.name', 'user.email', 'user.defaultRole'])
      .where(
        new Brackets((b) => {
          b.where('user.name ILIKE :term', { term: `%${term}%` }).orWhere(
            'user.email ILIKE :term',
            { term: `%${term}%` },
          );
        }),
      );

    if (organizationId) {
      qb.andWhere('user.organizationId = :organizationId', {
        organizationId,
      });
    }

    if (excludeProjectId) {
      qb.andWhere((inner: SelectQueryBuilder<User>) => {
        const sub = inner
          .subQuery()
          .select('pm.userId')
          .from('project_members', 'pm')
          .where('pm.projectId = :projectId', { projectId: excludeProjectId })
          .getQuery();
        return 'user.id NOT IN ' + sub;
      });
    }

    const rows = await qb.take(10).getMany();
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      defaultRole: u.defaultRole,
    }));
  }

  async findAllWithMemberships(
    organizationId?: string,
  ): Promise<UserWithMemberships[]> {
    const qb = this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('project_members', 'pm', 'pm.userId = user.id')
      .leftJoinAndSelect('pm.project', 'project')
      .select([
        'user.id',
        'user.name',
        'user.email',
        'user.avatarUrl',
        'user.isActive',
        'user.isSuperAdmin',
        'user.defaultRole',
        'pm.projectId',
        'pm.roleName',
        'project.id',
        'project.name',
        'project.key',
      ]);

    if (organizationId) {
      qb.where('user.organizationId = :organizationId', { organizationId });
    }

    const rawResults = await qb.getRawMany<RawMembershipRow>();
    const usersMap = new Map<string, UserWithMemberships>();

    for (const row of rawResults) {
      if (!usersMap.has(row.user_id)) {
        usersMap.set(row.user_id, {
          id: row.user_id,
          name: row.user_name,
          email: row.user_email,
          avatarUrl: row.user_avatarUrl,
          isActive: row.user_isActive,
          isSuperAdmin: row.user_isSuperAdmin,
          defaultRole: row.user_defaultRole,
          projectMemberships: [],
        });
      }

      if (row.pm_projectId) {
        const membership: UserMembershipProjectRef = {
          projectId: row.pm_projectId,
          projectName: row.project_name,
          projectKey: row.project_key,
          roleName: row.pm_roleName,
        };
        usersMap.get(row.user_id)!.projectMemberships.push(membership);
      }
    }

    return Array.from(usersMap.values());
  }

  async findUnassigned(
    organizationId?: string,
  ): Promise<UserSearchRow[]> {
    const qb = this.repo
      .createQueryBuilder('user')
      .leftJoin('project_members', 'pm', 'pm.userId = user.id')
      .where('pm.userId IS NULL')
      .select(['user.id', 'user.name', 'user.email', 'user.defaultRole']);

    if (organizationId) {
      qb.andWhere('user.organizationId = :organizationId', {
        organizationId,
      });
    }

    const rows = await qb.getMany();
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      defaultRole: u.defaultRole,
    }));
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

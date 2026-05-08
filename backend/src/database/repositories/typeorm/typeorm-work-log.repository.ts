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
import {
  BillableAggregate,
  BillableScope,
} from '../../interfaces/repository.interfaces';
import { WorkLogRepository } from '../work-log.repository';
import { mergeWhere } from './where-merge.helper';

interface RawSumRow {
  total: string | number | null;
}

interface RawBillableRow {
  totalMinutes: string | number | null;
  billableMinutes: string | number | null;
  amountCents: string | number | null;
}

function toNum(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}

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

  async sumMinutesByIssue(issueId: string): Promise<number> {
    const raw = await this.repo
      .createQueryBuilder('wl')
      .select('COALESCE(SUM(wl.minutesSpent), 0)', 'total')
      .where('wl.issueId = :issueId', { issueId })
      .getRawOne<RawSumRow>();
    return toNum(raw?.total);
  }

  async sumMinutesByProject(projectId: string): Promise<number> {
    const raw = await this.repo
      .createQueryBuilder('wl')
      .select('COALESCE(SUM(wl.minutesSpent), 0)', 'total')
      .where('wl.projectId = :projectId', { projectId })
      .getRawOne<RawSumRow>();
    return toNum(raw?.total);
  }

  async sumMinutesByUser(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('wl')
      .select('COALESCE(SUM(wl.minutesSpent), 0)', 'total')
      .where('wl.userId = :userId', { userId });
    if (startDate) {
      qb.andWhere('wl.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('wl.createdAt <= :endDate', { endDate });
    }
    const raw = await qb.getRawOne<RawSumRow>();
    return toNum(raw?.total);
  }

  async sumMinutesBySprint(sprintId: string): Promise<number> {
    const raw = await this.repo
      .createQueryBuilder('wl')
      .innerJoin('sprint_issues', 'si', 'si.issueId = wl.issueId')
      .select('COALESCE(SUM(wl.minutesSpent), 0)', 'total')
      .where('si.sprintId = :sprintId', { sprintId })
      .getRawOne<RawSumRow>();
    return toNum(raw?.total);
  }

  async aggregateBillable(
    scope: BillableScope,
  ): Promise<BillableAggregate> {
    const qb = this.repo
      .createQueryBuilder('wl')
      .select('COALESCE(SUM(wl.minutesSpent), 0)', 'totalMinutes')
      .addSelect(
        'COALESCE(SUM(CASE WHEN wl.billable = true THEN wl.minutesSpent ELSE 0 END), 0)',
        'billableMinutes',
      )
      .addSelect(
        'COALESCE(ROUND(SUM(CASE WHEN wl.billable = true AND wl.hourlyRate IS NOT NULL THEN wl.minutesSpent * wl.hourlyRate ELSE 0 END) * 100.0 / 60), 0)',
        'amountCents',
      );
    if (scope.issueId) {
      qb.where('wl.issueId = :issueId', { issueId: scope.issueId });
    } else if (scope.projectId) {
      qb.where('wl.projectId = :projectId', { projectId: scope.projectId });
    }
    const raw = await qb.getRawOne<RawBillableRow>();
    return {
      totalMinutes: toNum(raw?.totalMinutes),
      billableMinutes: toNum(raw?.billableMinutes),
      amountCents: toNum(raw?.amountCents),
    };
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

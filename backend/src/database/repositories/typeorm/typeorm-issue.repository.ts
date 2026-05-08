import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Readable } from 'stream';
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
import {
  IssueFilters,
  KanbanCard,
} from '../../interfaces/repository.interfaces';
import { IssueRepository } from '../issue.repository';
import { mergeWhere } from './where-merge.helper';

interface RawStatusCount {
  status: string;
  count: string | number;
}

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

  async findFilteredByProject(
    projectId: string,
    filters?: IssueFilters,
  ): Promise<Issue[]> {
    const qb = this.repo
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.assignee', 'assignee')
      .where('issue.project.id = :projectId', { projectId });

    if (!filters?.includeArchived) {
      qb.andWhere('issue.isArchived = :isArchived', { isArchived: false });
    }

    if (filters) {
      if (filters.status) {
        qb.andWhere('issue.status = :status', { status: filters.status });
      }
      if (filters.assigneeId) {
        qb.andWhere('assignee.id = :assigneeId', {
          assigneeId: filters.assigneeId,
        });
      }
      if (filters.type) {
        qb.andWhere('issue.type = :type', { type: filters.type });
      }
      if (filters.search) {
        qb.andWhere(
          '(issue.title ILIKE :search OR issue.description ILIKE :search)',
          { search: `%${filters.search}%` },
        );
      }
      if (filters.label) {
        qb.andWhere('issue.labels ILIKE :label', {
          label: `%${filters.label}%`,
        });
      }
      if (filters.sprint) {
        if (filters.sprint === 'null') {
          qb.leftJoin('sprint_issues', 'si_null', 'si_null.issueId = issue.id');
          qb.andWhere('si_null.id IS NULL');
        } else {
          qb.innerJoin('sprint_issues', 'si', 'si.issueId = issue.id');
          qb.andWhere('si.sprintId = :sprintId', { sprintId: filters.sprint });
        }
      }

      if (filters.sort === 'updatedAt') {
        qb.orderBy('issue.updatedAt', 'DESC');
      } else if (filters.sort === 'priority') {
        qb.addOrderBy(
          `CASE
            WHEN issue.priority = 'Highest' THEN 5
            WHEN issue.priority = 'High' THEN 4
            WHEN issue.priority = 'Medium' THEN 3
            WHEN issue.priority = 'Low' THEN 2
            WHEN issue.priority = 'Lowest' THEN 1
            ELSE 0 END`,
          'DESC',
        );
        qb.addOrderBy('issue.createdAt', 'DESC');
      } else {
        qb.orderBy('issue.createdAt', 'DESC');
      }
    } else {
      qb.orderBy('issue.createdAt', 'DESC');
    }

    qb.select([
      'issue.id',
      'issue.projectId',
      'issue.number',
      'issue.title',
      'issue.status',
      'issue.statusId',
      'issue.priority',
      'issue.type',
      'issue.assigneeId',
      'issue.reporterId',
      'issue.storyPoints',
      'issue.createdAt',
      'issue.updatedAt',
      'issue.labels',
      'assignee.id',
      'assignee.name',
      'assignee.email',
    ]);

    qb.leftJoinAndSelect('issue.reporter', 'reporter');
    qb.addSelect(['reporter.id', 'reporter.name', 'reporter.email']);

    return qb.getMany();
  }

  streamForExport(projectId: string): Promise<Readable> {
    return this.repo
      .createQueryBuilder('issue')
      .where('issue.projectId = :projectId', { projectId })
      .orderBy('issue.createdAt', 'DESC')
      .leftJoin('issue.parent', 'parent')
      .leftJoin('issue.assignee', 'assignee')
      .leftJoin('issue.reporter', 'reporter')
      .select([
        'issue.id AS issue_id',
        'issue.title AS issue_title',
        'issue.description AS issue_description',
        'issue.status AS issue_status',
        'issue.priority AS issue_priority',
        'issue.type AS issue_type',
        'issue.storyPoints AS issue_storyPoints',
        'issue.createdAt AS issue_createdAt',
        'issue.updatedAt AS issue_updatedAt',
        'assignee.name AS assignee_name',
        'assignee.email AS assignee_email',
        'reporter.name AS reporter_name',
        'reporter.email AS reporter_email',
        'parent.title AS parent_title',
      ])
      .stream();
  }

  async countByStatusForProject(
    projectId: string,
  ): Promise<{ status: string; count: number }[]> {
    const rows = await this.repo
      .createQueryBuilder('issue')
      .select('issue.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('issue.projectId = :projectId', { projectId })
      .groupBy('issue.status')
      .getRawMany<RawStatusCount>();
    return rows.map((row) => ({
      status: row.status,
      count: Number(row.count),
    }));
  }

  async findKanbanCards(projectId: string): Promise<KanbanCard[]> {
    const issues = await this.repo
      .createQueryBuilder('issue')
      .select([
        'issue.id',
        'issue.title',
        'issue.type',
        'issue.priority',
        'issue.assigneeId',
        'issue.storyPoints',
        'issue.status',
        'issue.statusId',
        'issue.backlogOrder',
      ])
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('issue.isArchived = false')
      .orderBy('issue.backlogOrder', 'ASC')
      .getMany();
    return issues.map((i) => ({
      id: i.id,
      title: i.title,
      type: String(i.type),
      priority: String(i.priority),
      assigneeId: i.assigneeId ?? null,
      storyPoints: i.storyPoints,
      status: i.status,
      statusId: i.statusId ?? null,
      backlogOrder: i.backlogOrder,
    }));
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

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Sprint, SprintStatus } from '../../entities/sprint.entity';
import { SprintIssue } from '../../entities/sprint-issue.entity';
import {
  AbstractSprintRepository,
  SprintStatsRow,
} from '../abstract/sprint.repository.abstract';

/**
 * Postgres Sprint Repository
 *
 * The ONLY class — inside or outside the sprints module — that owns
 * TypeORM's `Repository<Sprint>` and `Repository<SprintIssue>`. Every
 * other consumer depends on `AbstractSprintRepository`, so the ORM and
 * transaction strategy can be swapped without touching domain logic.
 *
 * EntityManager Passthrough: each write resolves its working
 * repository as `manager ? manager.getRepository(X) : this.<repo>` so
 * that, when a command/lifecycle service supplies its
 * `dataSource.transaction` manager, the write joins that transaction;
 * called bare, it runs standalone (binary-compatible with the legacy
 * non-transactional `archive` path).
 */
@Injectable()
export class PostgresSprintRepository extends AbstractSprintRepository {
  constructor(
    @InjectRepository(Sprint)
    private readonly sprintRepo: Repository<Sprint>,
    @InjectRepository(SprintIssue)
    private readonly siRepo: Repository<SprintIssue>,
  ) {
    super();
  }

  // ---------------------------------------------------------------------------
  // Sprint reads
  // ---------------------------------------------------------------------------

  findById(sprintId: string): Promise<Sprint | null> {
    return this.sprintRepo.findOne({ where: { id: sprintId } });
  }

  findDetailById(projectId: string, sprintId: string): Promise<Sprint | null> {
    return this.sprintRepo.findOne({
      where: { id: sprintId, projectId },
      relations: ['issues', 'issues.issue', 'project'],
    });
  }

  findAllInProject(projectId: string, activeOnly?: boolean): Promise<Sprint[]> {
    if (activeOnly) {
      return this.sprintRepo.find({
        where: { projectId, isActive: true, status: SprintStatus.ACTIVE },
      });
    }
    return this.sprintRepo.find({ where: { projectId } });
  }

  findActiveInProject(
    projectId: string,
    sprintId: string,
  ): Promise<Sprint | null> {
    return this.sprintRepo.findOne({
      where: { id: sprintId, projectId, isActive: true },
    });
  }

  findRecentCompleted(projectId: string, limit: number): Promise<Sprint[]> {
    return this.sprintRepo.find({
      where: { projectId, status: SprintStatus.COMPLETED },
      order: { endDate: 'DESC' },
      take: limit,
    });
  }

  findAllActiveSystemWide(): Promise<Sprint[]> {
    return this.sprintRepo.find({
      where: { status: SprintStatus.ACTIVE, isActive: true },
    });
  }

  // ---------------------------------------------------------------------------
  // SprintIssue (join) reads
  // ---------------------------------------------------------------------------

  findSprintIssue(
    sprintId: string,
    issueId: string,
  ): Promise<SprintIssue | null> {
    return this.siRepo.findOneBy({ sprintId, issueId });
  }

  findSprintIssuesWithIssue(sprintId: string): Promise<SprintIssue[]> {
    return this.siRepo.find({
      where: { sprintId },
      relations: ['issue'],
    });
  }

  findSprintIssuesOrdered(sprintId: string): Promise<SprintIssue[]> {
    return this.siRepo.find({
      where: { sprintId },
      relations: ['issue'],
      order: { sprintOrder: 'ASC' },
    });
  }

  async aggregateSprintStats(sprintId: string): Promise<SprintStatsRow | null> {
    const stats = await this.siRepo
      .createQueryBuilder('si')
      .leftJoin('si.issue', 'issue')
      .select('COUNT(issue.id)', 'totalIssues')
      .addSelect('SUM(issue.storyPoints)', 'totalPoints')
      .addSelect(
        "SUM(CASE WHEN issue.status = 'Done' THEN issue.storyPoints ELSE 0 END)",
        'completedPoints',
      )
      .addSelect(
        "COUNT(CASE WHEN issue.status = 'Done' THEN 1 ELSE NULL END)",
        'completedIssues',
      )
      .where('si.sprintId = :sprintId', { sprintId })
      .getRawOne<SprintStatsRow>();
    return stats ?? null;
  }

  // ---------------------------------------------------------------------------
  // Sprint writes
  // ---------------------------------------------------------------------------

  createEntity(data: Partial<Sprint>): Sprint {
    return this.sprintRepo.create(data);
  }

  save(sprint: Sprint, manager?: EntityManager): Promise<Sprint> {
    const repo = manager ? manager.getRepository(Sprint) : this.sprintRepo;
    return repo.save(sprint);
  }

  async remove(sprint: Sprint, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Sprint) : this.sprintRepo;
    await repo.remove(sprint);
  }

  // ---------------------------------------------------------------------------
  // SprintIssue (join) writes
  // ---------------------------------------------------------------------------

  createSprintIssue(
    data: { sprintId: string; issueId: string; sprintOrder: number },
    manager?: EntityManager,
  ): Promise<SprintIssue> {
    const repo = manager ? manager.getRepository(SprintIssue) : this.siRepo;
    const si = repo.create(data);
    return repo.save(si);
  }

  async moveIssuesToSprint(
    sprintIssueIds: string[],
    targetSprintId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(SprintIssue) : this.siRepo;
    await repo.update({ id: In(sprintIssueIds) }, { sprintId: targetSprintId });
  }

  async removeSprintIssue(
    sprintIssue: SprintIssue,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(SprintIssue) : this.siRepo;
    await repo.remove(sprintIssue);
  }

  async removeSprintIssues(
    sprintIssues: SprintIssue[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(SprintIssue) : this.siRepo;
    await repo.remove(sprintIssues);
  }
}

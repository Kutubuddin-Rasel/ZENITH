import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SprintSnapshot } from '../../entities/sprint-snapshot.entity';
import { AbstractSprintSnapshotRepository } from '../abstract/sprint-snapshot.repository.abstract';

/**
 * Postgres Sprint Snapshot Repository
 *
 * The ONLY class that owns `Repository<SprintSnapshot>`, including the
 * velocity "latest-per-sprint" subquery. Isolating the snapshot read
 * surface here is Directive B's "Prep for ClickHouse" — a future
 * Level-5 swap replaces this class alone.
 */
@Injectable()
export class PostgresSprintSnapshotRepository extends AbstractSprintSnapshotRepository {
  constructor(
    @InjectRepository(SprintSnapshot)
    private readonly snapshotRepo: Repository<SprintSnapshot>,
  ) {
    super();
  }

  findBySprintAndDate(
    sprintId: string,
    date: string,
  ): Promise<SprintSnapshot | null> {
    return this.snapshotRepo.findOne({ where: { sprintId, date } });
  }

  findBySprintOrdered(sprintId: string): Promise<SprintSnapshot[]> {
    return this.snapshotRepo.find({
      where: { sprintId },
      order: { date: 'ASC' },
    });
  }

  findLatestPerSprint(sprintIds: string[]): Promise<SprintSnapshot[]> {
    // Guard the empty case so we never emit an invalid `IN ()` clause.
    if (sprintIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.snapshotRepo
      .createQueryBuilder('snapshot')
      .where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('MAX(s.date)')
          .from('sprint_snapshots', 's')
          .where('s.sprintId = snapshot.sprintId')
          .getQuery();
        return 'snapshot.date = ' + subQuery;
      })
      .andWhere('snapshot.sprintId IN (:...sprintIds)', { sprintIds })
      .getMany();
  }

  createEntity(data: Partial<SprintSnapshot>): SprintSnapshot {
    return this.snapshotRepo.create(data);
  }

  save(
    snapshot: SprintSnapshot,
    manager?: EntityManager,
  ): Promise<SprintSnapshot> {
    const repo = manager
      ? manager.getRepository(SprintSnapshot)
      : this.snapshotRepo;
    return repo.save(snapshot);
  }
}

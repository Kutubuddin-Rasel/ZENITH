import { FindManyOptions } from 'typeorm';

import { WorkLog } from '../../issues/entities/work-log.entity';
import {
  BillableAggregate,
  BillableScope,
  IWorkLogReader,
  IWorkLogWriter,
} from '../interfaces/repository.interfaces';
import { BaseRepository } from './base.repository';

/**
 * DIP injection token for WorkLog persistence.
 *
 * Concrete impl: `{ provide: WorkLogRepository, useClass: TypeOrmWorkLogRepository }`.
 */
export abstract class WorkLogRepository
  extends BaseRepository<WorkLog>
  implements IWorkLogReader, IWorkLogWriter
{
  /** Time entries logged against a single issue. */
  abstract findByIssue(
    issueId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]>;

  /** Time entries logged by a single user. */
  abstract findByUser(
    userId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]>;

  /** Time entries scoped to a single project (across all issues). */
  abstract findByProject(
    projectId: string,
    options?: FindManyOptions<WorkLog>,
  ): Promise<WorkLog[]>;

  /** SUM(minutesSpent) for a single issue. */
  abstract sumMinutesByIssue(issueId: string): Promise<number>;

  /** SUM(minutesSpent) across all issues in a project. */
  abstract sumMinutesByProject(projectId: string): Promise<number>;

  /** SUM(minutesSpent) for a user, optionally bounded by date range. */
  abstract sumMinutesByUser(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<number>;

  /** SUM(minutesSpent) across issues attached to a sprint via sprint_issues. */
  abstract sumMinutesBySprint(sprintId: string): Promise<number>;

  /**
   * Currency-safe billable aggregate for an issue or project scope.
   * `amountCents` is computed in NUMERIC at the DB layer to avoid float drift.
   */
  abstract aggregateBillable(scope: BillableScope): Promise<BillableAggregate>;
}

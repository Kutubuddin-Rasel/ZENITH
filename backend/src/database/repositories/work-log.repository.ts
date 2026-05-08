import { FindManyOptions } from 'typeorm';

import { WorkLog } from '../../issues/entities/work-log.entity';
import {
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
}

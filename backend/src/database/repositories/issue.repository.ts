import { FindManyOptions } from 'typeorm';

import { Issue } from '../../issues/entities/issue.entity';
import {
  IIssueReader,
  IIssueWriter,
} from '../interfaces/repository.interfaces';
import { BaseRepository } from './base.repository';

/**
 * DIP injection token for Issue persistence.
 *
 * Consumers depend on this abstract class:
 *   constructor(private readonly issues: IssueRepository) {}
 *
 * Concrete implementation registered in `DatabaseModule` via
 * `{ provide: IssueRepository, useClass: TypeOrmIssueRepository }`.
 *
 * Inherits the full CRUD surface from `BaseRepository<Issue>` (Step 1) and
 * adds Issue-specific finders. The `implements IIssueReader, IIssueWriter`
 * clause enforces alignment with the role-segregated ISP contracts so
 * future divergence is caught at compile time.
 */
export abstract class IssueRepository
  extends BaseRepository<Issue>
  implements IIssueReader, IIssueWriter
{
  /** All issues belonging to a single project. */
  abstract findByProject(
    projectId: string,
    options?: FindManyOptions<Issue>,
  ): Promise<Issue[]>;
}

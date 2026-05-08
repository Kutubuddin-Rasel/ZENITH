import { FindManyOptions } from 'typeorm';

import { Project } from '../../projects/entities/project.entity';
import {
  IProjectReader,
  IProjectWriter,
} from '../interfaces/repository.interfaces';
import { BaseRepository } from './base.repository';

/**
 * DIP injection token for Project persistence.
 *
 * Project is the only Tier-1 aggregate that supports soft-delete
 * (`@DeleteDateColumn deletedAt`). `softRemove`/`restore` are inherited from
 * `BaseRepository<Project>` and exposed via `IProjectWriter`.
 *
 * Concrete impl: `{ provide: ProjectRepository, useClass: TypeOrmProjectRepository }`.
 */
export abstract class ProjectRepository
  extends BaseRepository<Project>
  implements IProjectReader, IProjectWriter
{
  /** Look up a project by its unique `key` (Project entity column). */
  abstract findByKey(key: string): Promise<Project | null>;

  /** All projects scoped to a single organization (multi-tenant boundary). */
  abstract findByOrganization(
    organizationId: string,
    options?: FindManyOptions<Project>,
  ): Promise<Project[]>;

  /**
   * All non-archived projects a given user is a member of, scoped to an
   * organization. Encapsulates the project_members join.
   */
  abstract findForMember(
    userId: string,
    organizationId: string,
  ): Promise<Project[]>;
}

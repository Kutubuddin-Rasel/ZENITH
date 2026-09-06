import { EntityManager } from 'typeorm';

import { ProjectAccessSettings } from '../../projects/entities/project-access-settings.entity';
import { BaseRepository } from './base.repository';

/**
 * DIP injection token for `ProjectAccessSettings` persistence.
 *
 * Replaces the raw `@InjectRepository(ProjectAccessSettings)`
 * leak inside `ProjectsService` (today at `projects.service.ts:68`).
 * Once `ProjectAccessQueryService` / `ProjectAccessCommandService`
 * land in Step 3, neither service may reference `Repository<T>` or
 * `DataSource` directly — every read/write flows through this
 * abstract.
 *
 * Concrete impl (Step 2): bind inside `CoreEntitiesModule` as
 * `{ provide: ProjectAccessSettingsRepository, useClass:
 *   TypeOrmProjectAccessSettingsRepository }`.
 *
 * No soft-delete: `ProjectAccessSettings` is a singleton-per-project
 * configuration row (`@Index … { unique: true }` on `projectId` with
 * CASCADE delete from `Project`). `softRemove` / `restore` are
 * intentionally omitted from the role-segregated surface; the
 * inherited `BaseRepository` methods exist for completeness but
 * MUST NOT be invoked.
 */
export abstract class ProjectAccessSettingsRepository extends BaseRepository<ProjectAccessSettings> {
  /**
   * Resolve the access-settings row for a project. Returns `null`
   * when no row exists yet — `IProjectAccessQuery.getAccessSettings`
   * is responsible for lazy-creating defaults in that case (mirrors
   * the legacy behaviour the security guard relies on).
   *
   * @param manager  Optional transactional `EntityManager`. When
   *                 supplied, the read participates in the caller's
   *                 transaction (read-your-writes semantics).
   */
  abstract findByProject(
    projectId: string,
    manager?: EntityManager,
  ): Promise<ProjectAccessSettings | null>;
}

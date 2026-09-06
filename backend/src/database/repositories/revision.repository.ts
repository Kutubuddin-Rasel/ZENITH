import { Revision } from '../../revisions/entities/revision.entity';
import { BaseRepository } from './base.repository';

/**
 * DIP injection token for `Revision` persistence — minimum surface
 * needed by the projects activity feed.
 *
 * Replaces the raw `DataSource.getRepository(Revision)` +
 * `createQueryBuilder('revision').where("revision.snapshot::jsonb
 *  ->> 'projectId' = :projectId")` leak inside `ProjectsService`
 * (today at `projects.service.ts:511-521`, flagged as a TODO in
 * the source). The JSONB path expression now lives inside the
 * concrete TypeOrm repository, not in the service layer.
 *
 * Concrete impl (Step 2): bind inside `CoreEntitiesModule` as
 * `{ provide: RevisionRepository, useClass:
 *   TypeOrmRevisionRepository }`.
 *
 * Tier-1 promotion deferred
 * -------------------------
 * This abstract is intentionally *narrow* — it carries only the
 * single method the projects aggregate needs. The full Tier-1
 * promotion of the revisions module (its own ISP token surface,
 * audit + write paths) is a separate Level 3 work item; this
 * Step-2-scoped abstract exists solely to close the projects-side
 * DIP violation without forcing a cross-module rewrite.
 *
 * No soft-delete: `Revision` rows are immutable audit history. The
 * inherited `softRemove`/`restore` methods MUST NOT be invoked.
 */
export abstract class RevisionRepository extends BaseRepository<Revision> {
  /**
   * Return the most recent `limit` revisions touching any entity
   * owned by `projectId`. Ordering: `createdAt DESC`. The concrete
   * implementation MUST clamp `limit` to a sane maximum (e.g.
   * 200) to prevent runaway scans, and MUST encapsulate the
   * `snapshot::jsonb ->> 'projectId'` predicate so callers stay
   * SQL-free.
   */
  abstract findByProjectId(
    projectId: string,
    limit: number,
  ): Promise<Revision[]>;
}

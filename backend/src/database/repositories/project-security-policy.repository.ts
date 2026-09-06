import { EntityManager } from 'typeorm';

import { ProjectSecurityPolicy } from '../../projects/entities/project-security-policy.entity';
import { BaseRepository } from './base.repository';

/**
 * DIP injection token for `ProjectSecurityPolicy` persistence.
 *
 * Replaces the raw `@InjectRepository(ProjectSecurityPolicy)`
 * leak inside the sibling `ProjectSecurityPolicyService` (today at
 * `project-security-policy.service.ts`). Once
 * `ProjectSecurityPolicyQueryService` lands in Step 3, neither it
 * nor any other consumer may reference `Repository<T>` directly —
 * every read/write flows through this abstract.
 *
 * Concrete impl (Step 2): bind inside `CoreEntitiesModule` as
 * `{ provide: ProjectSecurityPolicyRepository, useClass:
 *   TypeOrmProjectSecurityPolicyRepository }`.
 *
 * No soft-delete: `ProjectSecurityPolicy` is a singleton-per-project
 * configuration row (`@Column({ unique: true })` on `projectId`
 * with CASCADE delete from `Project`). `softRemove` / `restore` are
 * intentionally not exposed on the role-segregated surface; the
 * inherited `BaseRepository` methods exist for completeness but
 * MUST NOT be invoked.
 */
export abstract class ProjectSecurityPolicyRepository extends BaseRepository<ProjectSecurityPolicy> {
  /**
   * Resolve the security-policy row for a project. Returns `null`
   * when no row exists — the guard treats absence as "no
   * requirements" (fast path).
   *
   * @param manager  Optional transactional `EntityManager`. When
   *                 supplied, the read participates in the caller's
   *                 transaction.
   */
  abstract findByProject(
    projectId: string,
    manager?: EntityManager,
  ): Promise<ProjectSecurityPolicy | null>;
}

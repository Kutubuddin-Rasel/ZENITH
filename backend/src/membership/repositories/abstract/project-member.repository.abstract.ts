import type { EntityManager } from 'typeorm';

import { ProjectMember } from '../../entities/project-member.entity';

/**
 * Abstract Project-Member Repository (DIP Boundary)
 *
 * Defines the persistence contract for the `project_members` aggregate.
 * Every service inside the membership module depends ONLY on this
 * abstract — never on TypeORM's `Repository<ProjectMember>` directly.
 * The Postgres concrete owns the orm coupling; future stores (read
 * replica, projection, fake) drop in by extending this class.
 *
 * Persistence shape
 * -----------------
 * Methods return the TypeORM `ProjectMember` entity because it is the
 * canonical aggregate shape inside the membership module. External
 * consumers never see it — they read through `IProjectMemberQuery`
 * DTOs declared in `interfaces/membership.interfaces.ts`. DTO mapping
 * lives in the service layer, not here.
 *
 * Relation loading
 * ----------------
 *  - `findOne` / `findByUser`        → bare rows (no joins)
 *  - `listByProjectWithUser`         → row + narrow user projection
 *                                      (id, name, email, defaultRole)
 *  - `countByRoleId`                 → scalar count (RBAC usage probe)
 */
export abstract class AbstractProjectMemberRepository {
  /**
   * Find a single membership row by composite PK, or `null`.
   *
   * `manager` (optional) routes the read through a transactional
   * `EntityManager` so callers participating in a parent
   * `dataSource.transaction(...)` block see uncommitted writes from
   * the same transaction. When omitted, the implementation uses its
   * own injected repository.
   */
  abstract findOne(
    projectId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ProjectMember | null>;

  /**
   * Every project membership the user holds. Selects only the columns
   * the user-centric "My Projects" surface needs (projectId + roleName).
   */
  abstract findByUser(userId: string): Promise<ProjectMember[]>;

  /**
   * Project members joined with a narrow user projection. Sensitive
   * user columns (password hash, refresh tokens, MFA secrets, etc.)
   * are intentionally excluded by the implementation.
   */
  abstract listByProjectWithUser(projectId: string): Promise<ProjectMember[]>;

  /**
   * Persist a membership row (insert or update by composite PK).
   *
   * `manager` (optional) — see `findOne` above. Used by transactional
   * callers (`ProjectCommandService.create`) so a project + ownership
   * membership succeed-or-fail together.
   */
  abstract save(
    pm: ProjectMember,
    manager?: EntityManager,
  ): Promise<ProjectMember>;

  /** Hard-delete a membership row. */
  abstract remove(pm: ProjectMember): Promise<void>;

  /**
   * Count assignments referencing the given dynamic-RBAC `roleId`.
   * Powers the `IMembershipRoleUsageProbe` outbound port consumed by
   * RBAC role-deletion safety checks.
   */
  abstract countByRoleId(roleId: string): Promise<number>;
}

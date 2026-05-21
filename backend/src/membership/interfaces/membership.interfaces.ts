/**
 * Membership Module — Abstract Contracts (ISP Surface)
 *
 * These interfaces are the ONLY allowed coupling point between the
 * membership module and the rest of Zenith. Concrete services,
 * repositories, and persistence entities are implementation details
 * that must never leak across the module boundary.
 *
 * DTO Strategy
 * ------------
 * `ProjectMemberSummary`, `ProjectMemberWithUser`,
 * `ProjectMemberRoleDetails`, and `UserMembership` are pure
 * value-object views — they intentionally do NOT extend the TypeORM
 * `ProjectMember` entity so consumers cannot accidentally depend on
 * ORM metadata, lifecycle decorators, or lazy relations.
 *
 * Segregation Rationale (ISP)
 * ---------------------------
 *  - Query / Command split keeps read-heavy consumers (guards, CASL,
 *    domain services) decoupled from mutating capabilities (controller
 *    write paths, invite acceptance).
 *  - `IProjectMemberPolicy` isolates the role-hierarchy enforcement
 *    rules so they can be unit-tested without DB or event-bus fakes
 *    and so future policy rules (cooldowns, last-admin protection)
 *    have a clear home.
 *
 * The repository contract `AbstractProjectMemberRepository` lives in
 * `repositories/abstract/` — it is a module-internal DIP boundary and
 * is intentionally NOT re-exported through this barrel.
 */

import { ProjectRole } from '../enums/project-role.enum';

// ---------------------------------------------------------------------------
// Value-Object Views (DTOs)
// ---------------------------------------------------------------------------

/**
 * Minimal projection of a project membership row. Used by read paths
 * that only need the role assignment without the joined user record.
 */
export interface ProjectMemberSummary {
  readonly projectId: string;
  readonly userId: string;
  readonly roleName: ProjectRole;
  readonly roleId: string | null;
}

/**
 * Projection used by `listMembers(projectId)` — joins the user record
 * but exposes only the fields the members UI needs (id, name, email,
 * defaultRole). Sensitive fields (password hash, refresh tokens, MFA
 * secrets, etc.) are intentionally absent.
 */
export interface ProjectMemberWithUser {
  readonly projectId: string;
  readonly userId: string;
  readonly roleName: ProjectRole;
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly defaultRole: string;
  };
}

/**
 * Both legacy enum and dynamic-RBAC role identifiers for a single
 * membership row. Consumed by `PermissionsGuard` to drive
 * database-backed permission checks.
 */
export interface ProjectMemberRoleDetails {
  readonly roleId: string | null;
  readonly roleName: ProjectRole;
}

/**
 * User-centric projection — every project the user belongs to with
 * their assigned role. Used by the "My Projects" dashboard surface.
 */
export interface UserMembership {
  readonly projectId: string;
  readonly roleName: ProjectRole;
}

// ---------------------------------------------------------------------------
// Command DTOs (input contracts for the write-side surface)
// ---------------------------------------------------------------------------

/**
 * Input contract for `IProjectMemberCommand.addMember`.
 * `actorRole` is optional — when present, the command service runs
 * role-hierarchy enforcement to prevent privilege escalation.
 */
export interface AddMemberCommand {
  readonly projectId: string;
  readonly userId: string;
  readonly roleName: ProjectRole;
  readonly actorRole?: ProjectRole;
}

/**
 * Input contract for `IProjectMemberCommand.updateMemberRole`.
 * `actorRole` is optional — same hierarchy semantics as
 * `AddMemberCommand`.
 */
export interface UpdateMemberRoleCommand {
  readonly projectId: string;
  readonly userId: string;
  readonly newRole: ProjectRole;
  readonly actorRole?: ProjectRole;
}

// ---------------------------------------------------------------------------
// Read Surface — Pure queries, no audit, no events, no policy checks
// ---------------------------------------------------------------------------

export interface IProjectMemberQuery {
  /**
   * List all members of a project with their joined user record.
   * Implementations must use a narrow column selection to avoid
   * leaking sensitive user fields.
   */
  listMembers(projectId: string): Promise<readonly ProjectMemberWithUser[]>;

  /**
   * Return the user's role in the given project, or `null` if they
   * are not a member.
   */
  getUserRole(projectId: string, userId: string): Promise<ProjectRole | null>;

  /**
   * Return both `roleId` (dynamic RBAC) and `roleName` (legacy enum)
   * for a membership row, or `null` if no membership exists.
   */
  getMemberRoleDetails(
    projectId: string,
    userId: string,
  ): Promise<ProjectMemberRoleDetails | null>;

  /**
   * List every project membership the user holds. Used by the
   * user-centric "My Projects" view.
   */
  listMembershipsForUser(userId: string): Promise<readonly UserMembership[]>;
}

// ---------------------------------------------------------------------------
// Write Surface — Mutations with audit + event emission
// ---------------------------------------------------------------------------

/**
 * Every mutation MUST:
 *   1. Enforce role hierarchy via `IProjectMemberPolicy` when
 *      `actorRole` is supplied.
 *   2. Emit the audit log AFTER a successful DB write.
 *   3. Emit the corresponding `MEMBERSHIP_EVENTS.*` event AFTER a
 *      successful DB write (never on failure — phantom notifications
 *      are forbidden).
 */
export interface IProjectMemberCommand {
  /**
   * Add a user to a project. Idempotent on `(projectId, userId)` —
   * if a membership already exists with a different role, the role
   * is updated and a `member.role_changed` event is emitted instead
   * of `member.added`.
   */
  addMember(command: AddMemberCommand): Promise<ProjectMemberSummary>;

  /**
   * Remove a user from a project. Throws if the user is not a member.
   */
  removeMember(projectId: string, userId: string): Promise<void>;

  /**
   * Change a member's role. Throws if the user is not a member or if
   * the new role equals the existing role.
   */
  updateMemberRole(
    command: UpdateMemberRoleCommand,
  ): Promise<ProjectMemberSummary>;
}

// ---------------------------------------------------------------------------
// Policy Surface — Role-hierarchy enforcement (privilege escalation)
// ---------------------------------------------------------------------------

/**
 * Narrow check-only surface for membership policy decisions. Every
 * mutation in `IProjectMemberCommand` and every controller-level
 * actor-role check consumes membership policy exclusively through
 * this interface.
 *
 * Pure functions today (the role weight map is in-process), but the
 * port shape is async-friendly to leave room for future rules
 * (e.g., last-admin protection, role-change cooldowns) that may
 * need a DB lookup.
 */
export interface IProjectMemberPolicy {
  /**
   * Return `true` iff `actorRole` has sufficient authority in the
   * role hierarchy to assign/manage `targetRole`.
   */
  canManageRole(actorRole: ProjectRole, targetRole: ProjectRole): boolean;

  /**
   * Same as `canManageRole`, but throws `ForbiddenException` with a
   * consistent error message instead of returning a boolean. Used by
   * `IProjectMemberCommand` implementations to enforce hierarchy at
   * mutation entry points.
   */
  assertCanManageRole(actorRole: ProjectRole, targetRole: ProjectRole): void;
}

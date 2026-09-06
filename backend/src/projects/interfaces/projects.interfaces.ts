/**
 * Projects Module — Abstract Contracts (ISP Surface)
 *
 * These interfaces are the ONLY allowed coupling point between the
 * projects module and the rest of Zenith (Level 3 root aggregate).
 * Concrete services, the persistence entities `Project`,
 * `ProjectAccessSettings`, `ProjectSecurityPolicy`, and the
 * `Revision` row used for activity feeds are implementation details
 * that must never leak across the module boundary.
 *
 * DTO Strategy
 * ------------
 * `ProjectSummary`, `ProjectWithMembership`, `ProjectAccessView`,
 * `ProjectSecurityPolicyView`, `ProjectMetricsView`,
 * `ProjectActivityEntry`, and the command DTOs are pure value-object
 * views — they intentionally do NOT extend the TypeORM entities so
 * consumers cannot accidentally depend on ORM metadata, lifecycle
 * decorators, lazy relations, or the cross-aggregate `Organization`
 * reference embedded in `Project.organization`.
 *
 * Segregation Rationale (ISP)
 * ---------------------------
 *  - `IProjectQuery` / `IProjectCommand` split keeps read-heavy
 *    consumers (dashboard, taxonomy, releases, slack integration)
 *    decoupled from mutating capabilities (HTTP controller, wizard).
 *  - `IProjectMetrics` is isolated so the summary/activity flows can
 *    cache aggressively without touching the lifecycle surface.
 *  - `IProjectAccessQuery` / `IProjectAccessCommand` split lets
 *    read-only guard paths consume access settings without exposing
 *    write capabilities to any non-controller caller.
 *  - `IProjectSecurityPolicyQuery` exposes the narrowest possible
 *    surface needed by `project-security-policy.guard.ts`; the
 *    mutating surface stays HTTP-only (controller + dedicated command
 *    service introduced in Step 3).
 *  - `IAuditLogWriter` is a single-method seam so command services
 *    do not depend on the concrete `AuditLogsService` class — pure
 *    DIP, exactly mirroring how `IInviteTokenGenerator` decouples
 *    invites from `crypto.randomBytes`.
 *
 * The repository contracts
 * (`ProjectAccessSettingsRepository`, `ProjectSecurityPolicyRepository`,
 * `RevisionRepository`) live under `backend/src/database/repositories/`
 * because the persistence boundary is shared infrastructure — they
 * are bound inside `CoreEntitiesModule` and consumed via the abstract
 * class, never via `@InjectRepository(...)`.
 */

import { ProjectRole } from '../../membership/enums/project-role.enum';

// ===========================================================================
// Value-Object Views (DTOs) — zero TypeORM coupling
// ===========================================================================

// ---------------------------------------------------------------------------
// Project core projections
// ---------------------------------------------------------------------------

/**
 * Minimal projection of a project row. Used by every read path that
 * does not need cross-aggregate relations (organization, members,
 * template config). Matches the field set the dashboard, taxonomy,
 * releases, and slack-integration services consume today.
 */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly description: string | null;
  readonly templateId: string | null;
  readonly isArchived: boolean;
  readonly organizationId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Projection used by the "My Projects" view (`findForUser`) — adds
 * the caller's effective role on the project. `role` is `null` for
 * super-admin reads where membership is bypassed.
 */
export interface ProjectWithMembership extends ProjectSummary {
  readonly role: ProjectRole | null;
}

// ---------------------------------------------------------------------------
// Access-settings projection
// ---------------------------------------------------------------------------

/**
 * Pure projection of `ProjectAccessSettings`. The persistence entity
 * is wide (17 columns), but every consumer reads the full surface, so
 * the view mirrors it 1:1 — minus the TypeORM relation back to
 * `Project` which is intentionally elided to keep the DTO ORM-free.
 */
export interface ProjectAccessView {
  readonly id: string;
  readonly projectId: string;
  readonly accessControlEnabled: boolean;
  readonly defaultPolicy: string;
  readonly ipAllowlist: readonly string[];
  readonly countryAllowlist: readonly string[];
  readonly geographicFiltering: boolean;
  readonly timeBasedFiltering: boolean;
  readonly emergencyAccessEnabled: boolean;
  readonly userSpecificRules: boolean;
  readonly roleBasedRules: boolean;
  readonly maxRulesPerUser: number;
  readonly autoCleanupEnabled: boolean;
  readonly cleanupIntervalHours: number;
  readonly notificationEnabled: boolean;
  readonly logAllAccess: boolean;
  readonly requireApprovalForNewRules: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Security-policy projection
// ---------------------------------------------------------------------------

/**
 * Pure projection of `ProjectSecurityPolicy`. The guard
 * (`project-security-policy.guard.ts`) is the sole external consumer
 * of the read surface; it needs the auth / session / access /
 * notification flags but not the joined `updatedBy` user record, so
 * the DTO carries `updatedById` as a plain string.
 */
export interface ProjectSecurityPolicyView {
  readonly id: string;
  readonly projectId: string;
  // Authentication requirements
  readonly require2FA: boolean;
  readonly requirePasswordMinLength: number;
  readonly requirePasswordComplexity: boolean;
  readonly passwordMaxAgeDays: number;
  // Session requirements
  readonly maxSessionTimeoutMinutes: number;
  readonly enforceSessionTimeout: boolean;
  // Access requirements
  readonly requireIPAllowlist: boolean;
  readonly blockedCountries: readonly string[];
  // Notification settings
  readonly notifyOnPolicyViolation: boolean;
  readonly notifyOnAccessDenied: boolean;
  // Metadata
  readonly updatedById: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Metrics + activity projections
// ---------------------------------------------------------------------------

/**
 * Cached aggregation returned by `IProjectMetrics.getSummary`. Field
 * set is binary-compatible with the legacy controller payload so the
 * frontend stays unchanged across the refactor.
 */
export interface ProjectMetricsView {
  readonly projectId: string;
  readonly projectName: string;
  readonly totalIssues: number;
  readonly doneIssues: number;
  readonly percentDone: number;
  readonly statusCounts: Readonly<Record<string, number>>;
}

/**
 * Single row returned by `IProjectMetrics.getActivity`. Pure
 * projection of `Revision` — the `snapshot` JSONB is intentionally
 * exposed as `Record<string, unknown>` rather than `any` (SOLID
 * rubric: zero `any` in new code). Consumers that need a typed
 * snapshot must narrow at the call site.
 */
export interface ProjectActivityEntry {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: 'CREATE' | 'UPDATE' | 'DELETE';
  readonly snapshot: Readonly<Record<string, unknown>>;
  readonly changedBy: string;
  readonly createdAt: Date;
}

// ===========================================================================
// Command DTOs (input contracts for the write-side surfaces)
// ===========================================================================

/**
 * Input contract for `IProjectCommand.create`. Optional `templateId`
 * triggers `TemplateApplicationPort.applyTemplate` inside the same
 * transaction; if it fails, the entire project + ownership
 * membership rolls back (no orphan rows). `actorUserId` is the
 * caller's id — used both as the membership-owner and as the
 * `changedBy` value on the audit log.
 */
export interface CreateProjectCommand {
  readonly actorUserId: string;
  readonly name: string;
  readonly key: string;
  readonly description?: string;
  readonly templateId?: string;
  readonly leadUserId?: string;
}

/**
 * Input contract for `IProjectCommand.update`. Every field is
 * optional — the command service treats `undefined` as "no change".
 * `key` is intentionally NOT mutable post-create (immutable
 * external identifier).
 */
export interface UpdateProjectCommand {
  readonly name?: string;
  readonly description?: string;
}

/**
 * Input contract for `IProjectAccessCommand.updateAccessSettings`.
 * Mirrors the existing `UpdateProjectAccessSettingsDto` HTTP shape
 * exactly so the controller can pass DTOs through without
 * re-mapping. Every field is optional — the command service merges
 * the patch onto the existing settings row.
 */
export interface UpdateAccessSettingsCommand {
  readonly accessControlEnabled?: boolean;
  readonly defaultPolicy?: string;
  readonly ipAllowlist?: readonly string[];
  readonly countryAllowlist?: readonly string[];
  readonly geographicFiltering?: boolean;
  readonly timeBasedFiltering?: boolean;
  readonly emergencyAccessEnabled?: boolean;
  readonly userSpecificRules?: boolean;
  readonly roleBasedRules?: boolean;
  readonly maxRulesPerUser?: number;
  readonly autoCleanupEnabled?: boolean;
  readonly cleanupIntervalHours?: number;
  readonly notificationEnabled?: boolean;
  readonly logAllAccess?: boolean;
  readonly requireApprovalForNewRules?: boolean;
}

// ===========================================================================
// Read Surfaces — pure queries, no audit, no events, no policy checks
// ===========================================================================

/**
 * Project read surface. Consumed by every non-mutating caller of the
 * projects aggregate (dashboard, taxonomy, releases, slack
 * integration, lookup adapter, security-policy guard).
 *
 * All methods return DTO projections — TypeORM `Project` instances
 * MUST NOT leak across this interface.
 */
export interface IProjectQuery {
  /**
   * Resolve a project by primary key. Throws `NotFoundException` if
   * the project does not exist or is outside the caller's tenant —
   * read paths consistently fail loud rather than returning `null`
   * here because every consumer treats "missing project" as a 404,
   * not a degenerate case.
   */
  findById(projectId: string): Promise<ProjectSummary>;

  /**
   * Resolve a project by its unique `key` (the human-readable
   * external identifier). Returns `null` on miss — callers such as
   * `ProjectWizardService.ensureUniqueProjectKey` rely on null to
   * detect uniqueness, so this contract intentionally differs from
   * `findById`.
   */
  findByKey(key: string): Promise<ProjectSummary | null>;

  /**
   * List every project the user is a member of, scoped to their
   * organization. When `isSuperAdmin` is true the membership filter
   * is bypassed and every project in the organization is returned;
   * the `role` field on each row is `null` in that case.
   */
  findForUser(
    userId: string,
    isSuperAdmin: boolean,
  ): Promise<readonly ProjectWithMembership[]>;
}

/**
 * Project metrics read surface. Cacheable (5-minute TTL today);
 * isolated from `IProjectQuery` so cache invalidation can target
 * `project:{id}:summary` keys without touching the core read paths.
 */
export interface IProjectMetrics {
  /**
   * Aggregate issue counts + status histogram for a project. Cached
   * 5 minutes. Throws `NotFoundException` if the project does not
   * exist (delegates to `IProjectQuery.findById`).
   */
  getSummary(projectId: string): Promise<ProjectMetricsView>;

  /**
   * Recent revisions touching any entity owned by the project.
   * Ordered newest-first. `limit` defaults to 50 server-side; the
   * concrete service is responsible for clamping to a sane maximum
   * (e.g. 200) to prevent runaway scans.
   */
  getActivity(
    projectId: string,
    limit?: number,
  ): Promise<readonly ProjectActivityEntry[]>;
}

/**
 * Access-settings read surface. Lazy-create semantics: if no row
 * exists yet for the project, the implementation MUST create a
 * default row and return it (mirrors the legacy behaviour the
 * security-policy guard relies on).
 */
export interface IProjectAccessQuery {
  getAccessSettings(projectId: string): Promise<ProjectAccessView>;
}

/**
 * Security-policy read surface. Sole consumer today is
 * `project-security-policy.guard.ts` — the surface is intentionally
 * narrow.
 */
export interface IProjectSecurityPolicyQuery {
  /**
   * Resolve a project's security policy. Returns `null` when the
   * project has no explicit policy row (the guard treats this as
   * "no requirements"). Cached server-side; the concrete service
   * MUST tag cache entries with the project id so command-side
   * invalidations land.
   */
  getPolicy(projectId: string): Promise<ProjectSecurityPolicyView | null>;

  /**
   * Convenience check used by the guard's fast path — returns
   * `true` iff any requirement on the policy row is enabled
   * (2FA, password complexity, session timeout, IP allowlist, or
   * country block). Implementations MUST derive this from the same
   * cached policy row used by `getPolicy` to avoid two reads.
   */
  hasActiveRequirements(projectId: string): Promise<boolean>;
}

// ===========================================================================
// Write Surfaces — mutations with policy + audit + cache invalidation
// ===========================================================================

/**
 * Every mutation MUST:
 *   1. Enforce tenant ownership BEFORE mutating any persistence state.
 *   2. Persist the mutation through the appropriate abstract
 *      repository (`ProjectRepository`, `ProjectAccessSettingsRepository`,
 *      etc.) — never against a raw `Repository<T>` or `DataSource`.
 *   3. Emit the audit log via `IAuditLogWriter.log` AFTER a
 *      successful DB write.
 *   4. Invalidate the relevant cache entries (`project:{id}:*` tags)
 *      AFTER the write commits.
 */
export interface IProjectCommand {
  /**
   * Create a project. TRANSACTIONAL: the project row, the
   * lead-owner membership, the optional creator membership, and the
   * optional template application all execute inside a single
   * `dataSource.transaction(...)` block. If ANY step fails (unique
   * constraint, addMember validation, template seeding) the entire
   * transaction rolls back — no orphan projects, no half-applied
   * templates.
   *
   * Throws `BadRequestException` on duplicate `name`/`key`.
   */
  create(command: CreateProjectCommand): Promise<ProjectSummary>;

  /**
   * Patch a project's mutable fields. Throws `NotFoundException`
   * if the project does not exist or is outside the caller's
   * tenant.
   */
  update(
    projectId: string,
    patch: UpdateProjectCommand,
  ): Promise<ProjectSummary>;

  /**
   * Mark a project archived (`isArchived = true`). Reversible via
   * a subsequent `update` once an unarchive command is exposed
   * (out of scope for this refactor).
   */
  archive(projectId: string): Promise<ProjectSummary>;

  /**
   * Soft-delete a project (sets `deletedAt`). The concrete
   * implementation MUST use `softRemove` from the inherited
   * `BaseRepository` surface — hard-delete is forbidden because
   * downstream `boards`, `sprints`, and `issues` carry FK
   * references.
   */
  remove(projectId: string): Promise<void>;
}

/**
 * Access-settings write surface. Single-method today; isolated from
 * `IProjectCommand` so the audit severity (HIGH) and the cache
 * invalidation surface (`access-settings:{projectId}`) stay
 * narrowly scoped.
 */
export interface IProjectAccessCommand {
  /**
   * Apply the patch onto the project's access settings (creates
   * defaults first if no row exists). Emits an audit log with
   * `severity: HIGH` listing every changed field.
   */
  updateAccessSettings(
    projectId: string,
    patch: UpdateAccessSettingsCommand,
  ): Promise<ProjectAccessView>;
}

// ===========================================================================
// Audit Log Outbound Abstraction
// ===========================================================================

/**
 * Single-field action discriminator used by the audit pipeline. The
 * legacy `AuditLogEvent` permits arbitrary strings via its `action`
 * alias; this enum-like union captures the only values projects
 * command services emit today.
 */
export type ProjectAuditActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW';

/**
 * Audit severity passed through to `metadata.severity` on the
 * legacy `AuditLogEvent` shape. Limited to the values the projects
 * surface currently emits.
 */
export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Input contract for `IAuditLogWriter.log`. Field set is the
 * intersection of what the projects command surface actually emits
 * today — narrower than the legacy `AuditLogEvent` (which carries
 * 6 dual-named aliases for backward compatibility). The adapter
 * implementation maps this DTO onto the legacy shape.
 */
export interface AuditLogEntry {
  readonly tenantId: string;
  readonly actorId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly actionType: ProjectAuditActionType;
  readonly action: string;
  readonly projectId?: string;
  readonly severity?: AuditSeverity;
  readonly changes?: Readonly<Record<string, readonly [string, string]>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Outbound abstraction over `AuditLogsService`. Command services
 * depend on this interface (bound via `AUDIT_LOG_WRITER_TOKEN`) so
 * the concrete BullMQ-backed audit pipeline can evolve without
 * touching the projects aggregate.
 *
 * Implementations MUST be fire-and-forget at the call site — `log`
 * resolves once the entry is enqueued, NOT once it is persisted. A
 * failure to enqueue MUST NOT abort the parent business operation
 * (audit is observational, not transactional).
 */
export interface IAuditLogWriter {
  log(entry: AuditLogEntry): Promise<void>;
}

/**
 * Projects Module — Dependency Injection Tokens
 *
 * Every cross-class binding inside (and into) the projects module is
 * wired through these symbol tokens. Symbols guarantee module-scope
 * uniqueness and prevent accidental string-key collisions across the
 * monorepo (`provider.useExisting`, `@Inject(STR)` etc.).
 *
 * Convention
 * ----------
 *  - `PROJECT_*_TOKEN`            → interfaces owned by the projects module.
 *  - `AUDIT_LOG_WRITER_TOKEN`     → outbound abstraction over
 *                                   `AuditLogsService`. Lives here for
 *                                   now because `ProjectsModule` is the
 *                                   first consumer; if a second module
 *                                   needs it later, the constant can be
 *                                   relocated to the audit module
 *                                   without changing the symbol
 *                                   identity (consumers import by name).
 *
 * Repository tokens (`ProjectAccessSettingsRepository`,
 * `ProjectSecurityPolicyRepository`, `RevisionRepository`) are
 * intentionally NOT represented here — per the established pattern
 * (`ProjectRepository`, `IssueRepository`, `AbstractInviteRepository`),
 * abstract repository classes double as their own DI tokens in NestJS,
 * so the binding uses the abstract class directly rather than a
 * separate symbol.
 *
 * Outbound ports (`TemplateApplicationPort`) live under `ports/`
 * because the projects module OWNS the contract; the adapter is bound
 * externally inside `ProjectTemplatesModule`, mirroring how
 * `ProjectsModule` binds the `ProjectLookupPort` adapter for invites.
 */

// ---------------------------------------------------------------------------
// Internal service surfaces (ISP-segregated)
// ---------------------------------------------------------------------------

export const PROJECT_QUERY_TOKEN = Symbol('PROJECT_QUERY_TOKEN');
export const PROJECT_COMMAND_TOKEN = Symbol('PROJECT_COMMAND_TOKEN');
export const PROJECT_METRICS_TOKEN = Symbol('PROJECT_METRICS_TOKEN');
export const PROJECT_ACCESS_QUERY_TOKEN = Symbol('PROJECT_ACCESS_QUERY_TOKEN');
export const PROJECT_ACCESS_COMMAND_TOKEN = Symbol(
  'PROJECT_ACCESS_COMMAND_TOKEN',
);
export const PROJECT_SECURITY_POLICY_TOKEN = Symbol(
  'PROJECT_SECURITY_POLICY_TOKEN',
);

// ---------------------------------------------------------------------------
// Outbound abstraction (audit) — declared by projects, may relocate
// ---------------------------------------------------------------------------

export const AUDIT_LOG_WRITER_TOKEN = Symbol('AUDIT_LOG_WRITER_TOKEN');

// ---------------------------------------------------------------------------
// Token type aliases — handy when typing test fixtures / providers.
// ---------------------------------------------------------------------------

export type ProjectQueryToken = typeof PROJECT_QUERY_TOKEN;
export type ProjectCommandToken = typeof PROJECT_COMMAND_TOKEN;
export type ProjectMetricsToken = typeof PROJECT_METRICS_TOKEN;
export type ProjectAccessQueryToken = typeof PROJECT_ACCESS_QUERY_TOKEN;
export type ProjectAccessCommandToken = typeof PROJECT_ACCESS_COMMAND_TOKEN;
export type ProjectSecurityPolicyToken = typeof PROJECT_SECURITY_POLICY_TOKEN;
export type AuditLogWriterToken = typeof AUDIT_LOG_WRITER_TOKEN;

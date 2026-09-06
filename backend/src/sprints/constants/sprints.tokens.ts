/**
 * Sprints Module — Dependency Injection Tokens
 *
 * Every cross-class binding inside (and into) the sprints module is
 * wired through these symbol tokens. Symbols guarantee module-scope
 * uniqueness and prevent accidental string-key collisions across the
 * monorepo (`provider.useExisting`, `@Inject(TOKEN)` etc.).
 *
 * Convention
 * ----------
 *  - `SPRINT_*_TOKEN` → ISP-segregated service surfaces owned by the
 *    sprints module (`ISprintQuery`, `ISprintCommand`,
 *    `ISprintLifecycle`, `ISprintMembership`, `ISprintMetrics`,
 *    `ISprintSnapshot`).
 *
 * Repository tokens (`SprintRepository`, `SprintSnapshotRepository`)
 * and outbound ports (`ProjectLookupPort`) are intentionally NOT
 * represented here. Per the established pattern (mirrors
 * `issues.tokens.ts`), abstract repository/port classes double as their
 * own DI tokens in NestJS, so the binding uses the abstract class
 * directly rather than a separate symbol.
 *
 * Strangler-fig sequence
 * ----------------------
 * Step 1 binds every token via `useExisting: SprintsService` so the
 * legacy god class keeps serving every consumer while the contract
 * layer comes online. Step 3 swaps the bindings to the freshly
 * decomposed CQRS services (`SprintQueryService`, `SprintCommandService`,
 * `SprintLifecycleService`, `SprintMembershipService`,
 * `SprintAnalyticsService`, `SprintSnapshotService`) with zero
 * call-site churn.
 */

// ---------------------------------------------------------------------------
// Core sprint service surfaces (ISP-segregated)
// ---------------------------------------------------------------------------

export const SPRINT_QUERY_TOKEN = Symbol('SPRINT_QUERY_TOKEN');
export const SPRINT_COMMAND_TOKEN = Symbol('SPRINT_COMMAND_TOKEN');
export const SPRINT_LIFECYCLE_TOKEN = Symbol('SPRINT_LIFECYCLE_TOKEN');
export const SPRINT_MEMBERSHIP_TOKEN = Symbol('SPRINT_MEMBERSHIP_TOKEN');

// ---------------------------------------------------------------------------
// Read-heavy analytics surface — isolated for a future ClickHouse swap
// (Level-5 Data/ML phase) without touching core business logic.
// ---------------------------------------------------------------------------

export const SPRINT_METRICS_TOKEN = Symbol('SPRINT_METRICS_TOKEN');

// ---------------------------------------------------------------------------
// System-level snapshot/cron surface (tenant-bypassing background tasks)
// ---------------------------------------------------------------------------

export const SPRINT_SNAPSHOT_TOKEN = Symbol('SPRINT_SNAPSHOT_TOKEN');

// ---------------------------------------------------------------------------
// Token type aliases — handy when typing test fixtures / providers.
// ---------------------------------------------------------------------------

export type SprintQueryToken = typeof SPRINT_QUERY_TOKEN;
export type SprintCommandToken = typeof SPRINT_COMMAND_TOKEN;
export type SprintLifecycleToken = typeof SPRINT_LIFECYCLE_TOKEN;
export type SprintMembershipToken = typeof SPRINT_MEMBERSHIP_TOKEN;
export type SprintMetricsToken = typeof SPRINT_METRICS_TOKEN;
export type SprintSnapshotToken = typeof SPRINT_SNAPSHOT_TOKEN;

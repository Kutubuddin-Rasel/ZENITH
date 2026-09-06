/**
 * Issues Module — Dependency Injection Tokens
 *
 * Every cross-class binding inside (and into) the issues module is
 * wired through these symbol tokens. Symbols guarantee module-scope
 * uniqueness and prevent accidental string-key collisions across the
 * monorepo (`provider.useExisting`, `@Inject(STR)` etc.).
 *
 * Convention
 * ----------
 *  - `ISSUE_*_TOKEN` / `WORKLOG_*_TOKEN` / `TIMER_TOKEN` /
 *    `BILLABLE_TIME_TOKEN` → ISP-segregated service surfaces owned by
 *    the issues module (`IIssueQuery`, `IIssueCommand`,
 *    `IIssueTransition`, `IIssueAssignment`, `IIssueLinkCommand`,
 *    `IIssueImport`, `IWorkLogQuery`, `IWorkLogCommand`, `ITimer`,
 *    `IBillableTime`).
 *
 * Repository tokens (`IssueRepository`, `WorkLogRepository`,
 * `BoardRepository`, `ProjectRepository`, and `IssueLinkRepository`
 * once Step 2 promotes it to Tier-1) are intentionally NOT represented
 * here. Per the established pattern, abstract repository classes double
 * as their own DI tokens in NestJS, so the binding uses the abstract
 * class directly rather than a separate symbol.
 *
 * Outbound ports (Step 2: `UserLookupPort`, `AuditPort`,
 * `IssueBroadcastPort`, `WorkflowLookupPort`) likewise live under
 * `issues/ports/` and use abstract-class-as-token — no symbol
 * indirection.
 *
 * Strangler-fig sequence
 * ----------------------
 * Step 1 binds every token via `useExisting: IssuesService` /
 * `WorkLogsService` / `TimerService` / `BillableTimeService` so the
 * legacy god class keeps serving every consumer while the contract
 * layer comes online. Step 3 swaps the bindings to the freshly
 * decomposed CQRS services (`IssueQueryService`,
 * `IssueCommandService`, `IssueTransitionService`,
 * `IssueAssignmentService`, `IssueLinkService`, `IssueImportService`,
 * `WorkLogQueryService`, `WorkLogCommandService`) with zero call-site
 * churn.
 */

// ---------------------------------------------------------------------------
// Core issue service surfaces (ISP-segregated)
// ---------------------------------------------------------------------------

export const ISSUE_QUERY_TOKEN = Symbol('ISSUE_QUERY_TOKEN');
export const ISSUE_COMMAND_TOKEN = Symbol('ISSUE_COMMAND_TOKEN');
export const ISSUE_TRANSITION_TOKEN = Symbol('ISSUE_TRANSITION_TOKEN');
export const ISSUE_ASSIGNMENT_TOKEN = Symbol('ISSUE_ASSIGNMENT_TOKEN');

// ---------------------------------------------------------------------------
// Issue sub-concern surfaces
// ---------------------------------------------------------------------------

export const ISSUE_LINK_TOKEN = Symbol('ISSUE_LINK_TOKEN');
export const ISSUE_IMPORT_TOKEN = Symbol('ISSUE_IMPORT_TOKEN');

// Backlog ranking — the single writer of `Issue.backlogOrder`. Consumed by
// the backlog module (`BACKLOG_ORDERING_TOKEN`) via EntityManager passthrough;
// bound to `IssueRankingService` in the backlog refactor Step 2.
export const ISSUE_RANKING_TOKEN = Symbol('ISSUE_RANKING_TOKEN');

// ---------------------------------------------------------------------------
// Time-tracking surfaces (WorkLog / Timer / BillableTime) — kept inside
// the issues module per the locked refactor decision.
// ---------------------------------------------------------------------------

export const WORKLOG_QUERY_TOKEN = Symbol('WORKLOG_QUERY_TOKEN');
export const WORKLOG_COMMAND_TOKEN = Symbol('WORKLOG_COMMAND_TOKEN');
export const TIMER_TOKEN = Symbol('TIMER_TOKEN');
export const BILLABLE_TIME_TOKEN = Symbol('BILLABLE_TIME_TOKEN');

// ---------------------------------------------------------------------------
// Token type aliases — handy when typing test fixtures / providers.
// ---------------------------------------------------------------------------

export type IssueQueryToken = typeof ISSUE_QUERY_TOKEN;
export type IssueCommandToken = typeof ISSUE_COMMAND_TOKEN;
export type IssueTransitionToken = typeof ISSUE_TRANSITION_TOKEN;
export type IssueAssignmentToken = typeof ISSUE_ASSIGNMENT_TOKEN;
export type IssueLinkToken = typeof ISSUE_LINK_TOKEN;
export type IssueImportToken = typeof ISSUE_IMPORT_TOKEN;
export type IssueRankingToken = typeof ISSUE_RANKING_TOKEN;
export type WorkLogQueryToken = typeof WORKLOG_QUERY_TOKEN;
export type WorkLogCommandToken = typeof WORKLOG_COMMAND_TOKEN;
export type TimerToken = typeof TIMER_TOKEN;
export type BillableTimeToken = typeof BILLABLE_TIME_TOKEN;

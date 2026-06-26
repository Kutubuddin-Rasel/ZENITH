/**
 * Backlog Module — Dependency Injection Tokens
 *
 * The backlog is the final Level-4 aggregate to be sealed (`projects` →
 * `boards` → `issues` → `sprints` → `backlog`). Every cross-class binding
 * inside the module is wired through these symbol tokens. Symbols guarantee
 * module-scope uniqueness and prevent accidental string-key collisions
 * across the monorepo (`provider.useExisting`, `@Inject(TOKEN)` etc.).
 *
 * Convention
 * ----------
 *  - `BACKLOG_QUERY_TOKEN`    → `IBacklogQuery`    (cached read surface —
 *                               the ClickHouse-ready read projection).
 *  - `BACKLOG_ORDERING_TOKEN` → `IBacklogOrdering` (mutation surface —
 *                               delegates the actual Issue-row writes to
 *                               the issues aggregate's `ISSUE_RANKING_TOKEN`).
 *
 * The backlog-owned read projection abstract (`BacklogReadRepository`,
 * Step 2) is intentionally NOT represented here — per the established
 * pattern, abstract repository classes double as their own DI tokens in
 * NestJS, so the binding uses the abstract class directly rather than a
 * separate symbol.
 *
 * Strangler-fig sequence
 * ----------------------
 * Step 1 binds both tokens via `useExisting: BacklogService` so the legacy
 * service keeps serving the controller while the contract layer comes
 * online. Step 3 swaps the bindings to the decomposed CQRS services
 * (`BacklogQueryService`, `BacklogOrderingService`) with zero call-site
 * churn, and the controller injects the tokens instead of the concrete
 * class.
 */

// ---------------------------------------------------------------------------
// Backlog service surfaces (ISP-segregated, CQRS read/write split)
// ---------------------------------------------------------------------------

export const BACKLOG_QUERY_TOKEN = Symbol('BACKLOG_QUERY_TOKEN');
export const BACKLOG_ORDERING_TOKEN = Symbol('BACKLOG_ORDERING_TOKEN');

// ---------------------------------------------------------------------------
// Token type aliases — handy when typing test fixtures / providers.
// ---------------------------------------------------------------------------

export type BacklogQueryToken = typeof BACKLOG_QUERY_TOKEN;
export type BacklogOrderingToken = typeof BACKLOG_ORDERING_TOKEN;

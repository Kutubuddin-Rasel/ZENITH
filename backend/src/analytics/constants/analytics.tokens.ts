/**
 * Analytics Module — Dependency Injection Tokens
 *
 * Every cross-class binding inside the analytics module is wired through
 * these symbol tokens. Symbols guarantee module-scope uniqueness and
 * prevent accidental string-key collisions across the monorepo
 * (`provider.useExisting`, `@Inject(TOKEN)` etc.).
 *
 * Convention
 * ----------
 *  - `*_QUERY_TOKEN` / `*_JOB_TOKEN` → ISP-segregated service surfaces
 *    owned by the analytics module (`ICycleTimeQuery`, `ISprintRiskQuery`,
 *    `IHistoricalMetricsQuery`, `IStalledIssuesQuery`,
 *    `IAnalyticsAggregationJob`).
 *  - `ANALYTICS_READ_MODEL_TOKEN` / `PROJECT_METRICS_REPOSITORY_TOKEN` →
 *    outbound ports (Step 2). Unlike the Level-4 aggregates — which use
 *    abstract-class-as-token for repositories — the analytics read model
 *    and metrics rollup are bound via explicit symbols because their
 *    Postgres implementations are deliberately swappable for a future
 *    `ClickHouse*` impl (OLAP migration), and a symbol keeps the contract
 *    free of any class identity to anchor on.
 *
 * Strangler-fig sequence
 * ----------------------
 * Step 1 binds the five service-surface tokens via
 * `useExisting: <legacy concrete service>` so every consumer keeps being
 * served while the contract layer comes online (`tsc` proves the surfaces
 * match). `ANALYTICS_READ_MODEL_TOKEN` and `PROJECT_METRICS_REPOSITORY_TOKEN`
 * are intentionally NOT bound yet — Step 2 lands the Postgres impls and
 * registers them. Step 3 repoints the service-surface tokens onto the
 * decomposed CQRS services (`CycleTimeQueryService`, `SprintRiskQueryService`,
 * `HistoricalMetricsQueryService`, `StalledIssuesQueryService`,
 * `AnalyticsAggregationJobService`) with zero call-site churn.
 */

// ---------------------------------------------------------------------------
// Read service surfaces (ISP-segregated) — consumed by AnalyticsController
// ---------------------------------------------------------------------------

export const CYCLE_TIME_QUERY_TOKEN = Symbol('CYCLE_TIME_QUERY_TOKEN');
export const SPRINT_RISK_QUERY_TOKEN = Symbol('SPRINT_RISK_QUERY_TOKEN');
export const HISTORICAL_METRICS_QUERY_TOKEN = Symbol(
  'HISTORICAL_METRICS_QUERY_TOKEN',
);
export const STALLED_ISSUES_QUERY_TOKEN = Symbol('STALLED_ISSUES_QUERY_TOKEN');

// ---------------------------------------------------------------------------
// Write / scheduled surface — the two `@Cron` aggregation jobs
// ---------------------------------------------------------------------------

export const ANALYTICS_AGGREGATION_JOB_TOKEN = Symbol(
  'ANALYTICS_AGGREGATION_JOB_TOKEN',
);

// ---------------------------------------------------------------------------
// Outbound ports (Step 2) — OLAP/OLTP isolation, ClickHouse-swappable
// ---------------------------------------------------------------------------

/** Dialect-free read port over the live OLTP `issues`/`projects` tables. */
export const ANALYTICS_READ_MODEL_TOKEN = Symbol('ANALYTICS_READ_MODEL_TOKEN');

/** Read/write port over the pre-aggregated `ProjectMetrics` rollup. */
export const PROJECT_METRICS_REPOSITORY_TOKEN = Symbol(
  'PROJECT_METRICS_REPOSITORY_TOKEN',
);

// ---------------------------------------------------------------------------
// Token type aliases — handy when typing test fixtures / providers.
// ---------------------------------------------------------------------------

export type CycleTimeQueryToken = typeof CYCLE_TIME_QUERY_TOKEN;
export type SprintRiskQueryToken = typeof SPRINT_RISK_QUERY_TOKEN;
export type HistoricalMetricsQueryToken = typeof HISTORICAL_METRICS_QUERY_TOKEN;
export type StalledIssuesQueryToken = typeof STALLED_ISSUES_QUERY_TOKEN;
export type AnalyticsAggregationJobToken =
  typeof ANALYTICS_AGGREGATION_JOB_TOKEN;
export type AnalyticsReadModelToken = typeof ANALYTICS_READ_MODEL_TOKEN;
export type ProjectMetricsRepositoryToken =
  typeof PROJECT_METRICS_REPOSITORY_TOKEN;

/**
 * Reports Module — Dependency Injection Tokens
 *
 * Every cross-class binding inside the reports module is wired through these
 * symbol tokens. Symbols guarantee module-scope uniqueness and prevent
 * accidental string-key collisions across the monorepo (`@Inject(TOKEN)`,
 * `provider.useClass` / `useExisting`).
 *
 * Convention
 * ----------
 *  - `REPORT_DATA_PROVIDER_TOKEN` / `REPORT_FORMATTER_TOKEN` → MULTI-provider
 *    arrays (Step 3). Each report-type strategy and each format strategy is
 *    registered under its shared token; the two registries inject the array
 *    and fold it into an O(1) `Map` (the N×M → N+M dispatch win).
 *  - `REPORT_EXPORTER_TOKEN` → the single export facade (Step 3) consumed by
 *    the controller and the BullMQ processor.
 *  - `REPORTS_READ_MODEL_TOKEN` → the reports-owned aggregation port (Step 2).
 *    Bound via an explicit symbol (NOT abstract-class-as-token) precisely
 *    because its Postgres impl is deliberately swappable for a future
 *    `ClickHouse*` impl (the OLAP migration), mirroring
 *    `ANALYTICS_READ_MODEL_TOKEN` / `SPRINT_METRICS_TOKEN`.
 *
 * Strangler-fig sequence
 * ----------------------
 * Step 1 (this step) introduces the contracts + tokens only — there is NO
 * existing class that satisfies `IReportExporter` / `IReportsReadModel`, so
 * (unlike the analytics `useExisting` strangler) nothing is bound yet and the
 * legacy `ReportsService` keeps serving every endpoint. Step 2 lands
 * `PostgresReportsReadRepository` + the formatter adapters and binds
 * `REPORTS_READ_MODEL_TOKEN` (`useClass`) + `REPORT_FORMATTER_TOKEN`. Step 3
 * lands the per-report providers + registries + `ReportExportService` and
 * binds `REPORT_DATA_PROVIDER_TOKEN` + `REPORT_EXPORTER_TOKEN`, then slims the
 * controller/processor onto the facade with zero public-API churn.
 *
 * Reused (NOT redeclared here) — imported from their owning sealed barrels:
 *   `SPRINT_QUERY_TOKEN` (src/sprints), `ISSUE_QUERY_TOKEN` (src/issues),
 *   `CACHE_STORE_TOKEN` (src/cache), `TENANT_CONTEXT_READER_TOKEN`
 *   (src/core/tenant), `PROJECT_MEMBER_QUERY_TOKEN` (src/membership).
 */

// ---------------------------------------------------------------------------
// Export facade — consumed by ReportsController + ScheduledReportsProcessor
// ---------------------------------------------------------------------------

export const REPORT_EXPORTER_TOKEN = Symbol('REPORT_EXPORTER_TOKEN');

// ---------------------------------------------------------------------------
// Strategy arrays (MULTI-provider) — folded into O(1) registries in Step 3
// ---------------------------------------------------------------------------

/** One `IReportDataProvider` per `ReportType`. */
export const REPORT_DATA_PROVIDER_TOKEN = Symbol('REPORT_DATA_PROVIDER_TOKEN');

/** One `IReportFormatter` per `ReportFormat`. */
export const REPORT_FORMATTER_TOKEN = Symbol('REPORT_FORMATTER_TOKEN');

// ---------------------------------------------------------------------------
// Outbound read port (Step 2) — OLTP read seam, ClickHouse-swappable
// ---------------------------------------------------------------------------

/** Dialect-free aggregation port over the live `Issue`/`SprintIssue`/`Project`
 *  tables. The ONLY reports surface allowed to import those entities. */
export const REPORTS_READ_MODEL_TOKEN = Symbol('REPORTS_READ_MODEL_TOKEN');

// ---------------------------------------------------------------------------
// Token type aliases — handy when typing test fixtures / providers.
// ---------------------------------------------------------------------------

export type ReportExporterToken = typeof REPORT_EXPORTER_TOKEN;
export type ReportDataProviderToken = typeof REPORT_DATA_PROVIDER_TOKEN;
export type ReportFormatterToken = typeof REPORT_FORMATTER_TOKEN;
export type ReportsReadModelToken = typeof REPORTS_READ_MODEL_TOKEN;

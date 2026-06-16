/**
 * Analytics Module — Public Barrel (SEALED, Step 4)
 *
 * STRICT BOUNDARY: only the ISP contracts, DI tokens, result DTOs, and the
 * `MetricType` enum / `IPercentiles` view type are exported here. The
 * decomposed CQRS services (`CycleTimeQueryService`, the pure
 * `CycleTimeCalculator`, `SprintRiskQueryService`, `StalledIssuesQueryService`,
 * `AnalyticsAggregationJobService`, `HistoricalMetricsQueryService`), the
 * outbound-port implementations (`PostgresAnalyticsReadRepository`,
 * `TypeormProjectMetricsRepository`), the alerting subsystem, the
 * `ProjectMetrics` entity, the HTTP controller, the cron, and the
 * `AnalyticsModule` class itself are module-internal and must be consumed
 * exclusively through the tokens in `constants/analytics.tokens.ts`.
 *
 * Mirrors `sprints/index.ts` / `backlog/index.ts` — same convention, same
 * export discipline. Analytics is the FIRST Level-3 (Communication &
 * Observability) module to be sealed, after the Level-4 core domain
 * (`projects` → `boards` → `issues` → `sprints` → `backlog`).
 *
 * Analytics has ZERO external consumers today (only `app.module` registers
 * `AnalyticsModule` by direct path), so this barrel + the
 * `ANALYTICS_DEEP_IMPORT_PATTERNS` lint boundary are PREVENTIVE — they keep
 * the module sealed against any future cross-module reach, and they preserve
 * the OLAP/OLTP isolation (the Postgres read-model + rollup impls can be
 * swapped for `ClickHouse*` impls behind the tokens with no consumer churn).
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `services/*`      → bound behind the ISP tokens; never injected as
 *                        concrete classes. The legacy god-services are gone.
 *  - `repositories/*`  → the OLTP read-model + rollup DIP seam (ClickHouse
 *                        swap point) — internal to the module.
 *  - `alerting/*`      → consumed only via its own BullMQ `ALERTS_QUEUE`
 *                        boundary; out of scope of the refactor, kept internal.
 *  - `entities/*`      → TypeORM persistence detail. `MetricType` (enum) and
 *                        `IPercentiles` (JSONB view) are the lone value/type
 *                        re-exports — they are part of the public contract
 *                        (`HistoricalMetricPoint.percentiles`, the `metricType`
 *                        query param); the `ProjectMetrics` class stays internal.
 *  - `dto/*`           → HTTP request shapes; consumers speak the ISP contracts.
 *  - `*.controller`    → HTTP entry point, not an injection target.
 *  - `AnalyticsModule` → imported by direct path for NestJS DI membership
 *                        (`app.module`); not re-exported.
 *
 * To add a new public surface: add an interface to
 * `interfaces/analytics.interfaces.ts` and a token to
 * `constants/analytics.tokens.ts`. Never re-export a class from here.
 */

export * from './interfaces/analytics.interfaces';
export * from './constants/analytics.tokens';

// Domain events (L1 decoupling): the stall-detection cron emits
// `ANALYTICS_EVENTS.STALL_ALERT` instead of calling NotificationsService
// synchronously. The notifications listener consumes this contract via the
// barrel — additive public-contract evolution, like the tokens above.
export * from './events/analytics-events';

// Lone value/type re-exports: the metric-type enum and the percentile JSONB
// view. Their TypeORM entity (`ProjectMetrics`) stays module-internal, but
// both are part of the public contract referenced by the exported DTOs
// (`HistoricalMetricPoint` / `PersistMetricInput`) and the `metricType` query.
export { MetricType } from './entities/project-metrics.entity';
export type { IPercentiles } from './entities/project-metrics.entity';

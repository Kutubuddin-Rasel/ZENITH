/**
 * Reports Module — Public Barrel (SEALED, Step 4)
 *
 * STRICT BOUNDARY: only the ISP contracts, the canonical `ReportTable`
 * view-model, the DI tokens, and the unified `ReportType` / `ReportFormat`
 * enums are exported here. The CQRS read facade (`ReportQueryService`), the
 * per-report data providers, the format adapters (`Pdf`/`Xlsx`/`CsvReportFormatter`,
 * sole owners of `pdfkit`/`exceljs`), the O(1) dispatch registries, the export
 * facade, the OLTP read-model repository, the scheduled-reports cron +
 * processor + their interfaces, the HTTP controller, the DTO, and the
 * `ReportsModule` class itself are module-internal and must be consumed
 * exclusively through the tokens in `constants/reports.tokens.ts`.
 *
 * Mirrors `analytics/index.ts` / `sprints/index.ts` — same convention, same
 * export discipline. Reports is the LAST Level-3 module sealed (after
 * `projects` → `boards` → `issues` → `sprints` → `backlog` → `analytics`).
 *
 * Reports has ZERO external consumers today (only `app.module` registers
 * `ReportsModule` by direct path), so this barrel + the
 * `REPORTS_DEEP_IMPORT_PATTERNS` lint boundary are PREVENTIVE — they keep the
 * module sealed against any future cross-module reach and preserve the
 * OLAP/OLTP isolation: `PostgresReportsReadRepository` can be swapped for a
 * `ClickHouseReportsReadRepository` behind `REPORTS_READ_MODEL_TOKEN` with no
 * consumer churn.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `services/*`      → the read facade, registries, and export facade — bound
 *                        behind the ISP tokens; never injected as concrete
 *                        classes. The legacy god-classes are gone.
 *  - `providers/*`     → per-report strategies, folded into the registries via
 *                        `REPORT_DATA_PROVIDER_TOKEN` — internal.
 *  - `formatters/*`    → the `pdfkit`/`exceljs` isolation seam, folded via
 *                        `REPORT_FORMATTER_TOKEN` — internal.
 *  - `repositories/*`  → the OLTP read-model DIP seam (ClickHouse swap point).
 *  - `processors/*`,
 *    `interfaces/scheduled-report.interfaces`
 *                      → the BullMQ cron→queue→S3 pipeline, consumed only via
 *                        its own queue boundary — internal.
 *  - `*.controller`,
 *    `dto/*`           → HTTP entry point + request shapes, not injection
 *                        targets.
 *  - `ReportsModule`   → imported by direct path for NestJS DI membership
 *                        (`app.module`); not re-exported.
 *
 * To add a new public surface: add an interface to
 * `interfaces/reports.interfaces.ts` and a token to
 * `constants/reports.tokens.ts`. Never re-export a class from here.
 */

// Contract layer — ISP surfaces, canonical `ReportTable` view-model, the
// per-report data shapes, AND the unified `ReportType` / `ReportFormat` enums
// (declared here, so this single `export *` re-exports them as values too).
export * from './interfaces/reports.interfaces';

// DI tokens — the only sanctioned coupling points into the module.
export * from './constants/reports.tokens';

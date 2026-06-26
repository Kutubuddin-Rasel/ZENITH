/**
 * Backlog Module — Public Barrel (SEALED, Step 4)
 *
 * STRICT BOUNDARY: only the ISP contracts and DI tokens are exported here.
 * The decomposed CQRS services (`BacklogQueryService`,
 * `BacklogOrderingService`, `BacklogCacheService`), the read-projection
 * repository, the DTOs, the HTTP controller, and the `BacklogModule` class
 * itself are module-internal and must be consumed exclusively through the
 * tokens in `constants/backlog.tokens.ts`.
 *
 * Mirrors `sprints/index.ts` / `issues/index.ts` — same convention, same
 * export discipline. Backlog is the final Level-4 aggregate to be sealed
 * (`projects` → `boards` → `issues` → `sprints` → `backlog`).
 *
 * Backlog has ZERO external consumers today (only `app.module` registers
 * `BacklogModule` by direct path), so this barrel + the
 * `BACKLOG_DEEP_IMPORT_PATTERNS` lint boundary are PREVENTIVE — they keep
 * the module sealed against any future cross-module reach.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `services/*`      → bound behind the ISP tokens; never injected as
 *                        concrete classes. The legacy `BacklogService` god
 *                        class is gone.
 *  - `repositories/*`  → persistence detail (the read projection / DIP seam).
 *  - `dto/*`           → HTTP request shapes; the typed contracts live on the
 *                        ISP interfaces.
 *  - `*.controller`    → HTTP entry point, not an injection target.
 *  - `BacklogModule`   → imported by direct path for NestJS DI membership
 *                        (`app.module`); not re-exported.
 *
 * To add a new public surface: add an interface to
 * `interfaces/backlog.interfaces.ts` and a token to
 * `constants/backlog.tokens.ts`. Never re-export a class from here.
 */

export * from './interfaces/backlog.interfaces';
export * from './constants/backlog.tokens';

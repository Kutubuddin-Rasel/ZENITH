/**
 * Sprints Module — Public Barrel (SEALED in Step 4)
 *
 * STRICT BOUNDARY: only the ISP contracts, DI tokens, view projections,
 * and the `SprintStatus` enum are exported here. The decomposed CQRS
 * services (`SprintQueryService`, `SprintCommandService`,
 * `SprintLifecycleService`, `SprintMembershipService`,
 * `SprintAnalyticsService`, `SprintSnapshotService`), the TypeORM
 * entities, the HTTP controller, the cron, and the `SprintsModule` class
 * itself are module-internal and must be consumed exclusively through the
 * tokens in `constants/sprints.tokens.ts`.
 *
 * Mirrors `issues/index.ts` and `boards/index.ts` exactly — same
 * convention, same export discipline. Sprints is the FINAL Level-4
 * aggregate to be sealed (`projects` → `boards` → `issues` → `sprints`).
 *
 * Step 4 SEALED this barrel: the 869-line `SprintsService` god class was
 * DELETED, the 7 deep-import consumers were migrated off
 * `'../sprints/sprints.service'` onto the ISP tokens below (the two
 * `forwardRef(() => SprintsService)` cycle smells in project-templates
 * are erased — a token has no class identity to cycle on), `SprintsCron`
 * now injects `SPRINT_SNAPSHOT_TOKEN`, and the `no-restricted-imports`
 * boundary lint (`SPRINTS_DEEP_IMPORT_PATTERNS` in `eslint.config.mjs`)
 * bans every deep path into the module internals.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `services/*`        → bound behind the ISP tokens below; never injected
 *                          as concrete classes. The legacy god class is gone.
 *  - `entities/*`        → TypeORM persistence detail. `SprintStatus` is the
 *                          lone value-level re-export (it is part of the public
 *                          contract — `SprintView.status`, consumer filters);
 *                          the `Sprint`/`SprintIssue`/`SprintSnapshot` classes
 *                          stay internal — consumers speak the `SprintView` /
 *                          `SprintIssueView` / `SprintSnapshotView` projections.
 *  - `repositories/*`,
 *    `adapters/*`,
 *    `ports/*`           → persistence + outbound wiring, internal to the module.
 *  - `*.controller`      → HTTP entry point, not an injection target.
 *  - `dto/*`             → HTTP request shapes; consumers speak the typed
 *                          command specs on the ISP interfaces.
 *  - `SprintsModule`     → imported by direct path for NestJS DI membership
 *                          (`app.module` + the consumer modules); not re-exported.
 *
 * To add a new public surface: add an interface to
 * `interfaces/sprints.interfaces.ts` and a token to
 * `constants/sprints.tokens.ts`. Never re-export a class from here.
 */

export * from './interfaces/sprints.interfaces';
export * from './constants/sprints.tokens';

// The only value-level re-export: the sprint status enum. Its TypeORM
// entity (`Sprint`) stays module-internal, but the enum is part of the
// public contract (`SprintView.status`, consumer `status === COMPLETED`
// filters), so consumers import it from the barrel.
export { SprintStatus } from './entities/sprint.entity';

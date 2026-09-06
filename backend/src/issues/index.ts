/**
 * Issues Module — Public Barrel (Step 2; SEALED in Step 4)
 *
 * STRICT BOUNDARY: only abstract contracts, DI tokens, and the outbound
 * ports are exported here. Concrete services (`IssuesService`,
 * `WorkLogsService`, `TimerService`, `BillableTimeService`), TypeORM entities,
 * the HTTP controllers, and the `IssuesModule` class itself are
 * module-internal and must be consumed exclusively through the tokens in
 * `constants/issues.tokens.ts` or the ports below.
 *
 * Mirrors `boards/index.ts` exactly — same convention, same export
 * discipline. Issues is the third Level-3 aggregate to be sealed
 * (`projects` → `boards` → `issues`).
 *
 * Established in Step 2 so the capability-owner modules that bind the outbound
 * port adapters import the abstract-class tokens from `'issues'` (never from
 * `'issues/ports/*'`):
 *   - `UsersCoreModule`   → `UserLookupPort`
 *   - `AuditLogsModule`   → `AuditPort`
 *   - `GatewaysModule`    → `IssueBroadcastPort`
 *   - `WorkflowsModule`   → `WorkflowStatusLookupPort`, `WorkflowTransitionPolicyPort`
 *
 * Step 4 SEALED this barrel: the `IssueStatus`/`IssuePriority`/`IssueType`
 * enums are re-exported for external consumers (dashboard / sprints /
 * integrations), the 10 deep-import consumers were migrated off
 * `'../issues/issues.service'` onto the ISP tokens below, the legacy
 * `IssuesService` / `WorkLogsService` god class was DELETED, and the
 * `no-restricted-imports` boundary lint (`ISSUES_DEEP_IMPORT_PATTERNS` in
 * `eslint.config.mjs`) now bans every deep path into the module internals.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `services/*`        → bound behind the ISP tokens below; never injected
 *                          as concrete classes. The legacy god class is gone.
 *  - `entities/*`        → TypeORM persistence detail. The three enums are the
 *                          lone re-export (value-level), surfaced here so
 *                          consumers stop deep-importing `entities/issue.entity`.
 *                          The `Issue`/`IssueLink`/`WorkLog` classes stay
 *                          internal — consumers speak the `IssueView` /
 *                          `IssueLinkView` / `WorkLogView` projections.
 *  - `mappers/*`         → pure transforms, used only by internal services.
 *  - `*.controller`      → HTTP entry points, not injection targets.
 *  - `dto/*`             → HTTP request shapes; consumers speak the typed
 *                          command specs on the ISP interfaces.
 *  - `IssuesModule`      → imported by direct path for NestJS DI membership
 *                          (`app.module` + the consumer modules); not re-exported.
 *
 * To add a new public surface: add an interface to
 * `interfaces/issues.interfaces.ts` (or a port to `ports/`) and a token to
 * `constants/issues.tokens.ts`. Never re-export a class from here.
 */

export * from './interfaces/issues.interfaces';
export * from './constants/issues.tokens';
export * from './ports/user-lookup.port';
export * from './ports/audit.port';
export * from './ports/issue-broadcast.port';
export * from './ports/workflow-lookup.port';

// The only value-level re-export: the issue enums. Their TypeORM entity
// (`Issue`) stays module-internal, but the enums are part of the public
// contract (`CreateIssueDto.type`, `IssueFilter.status`, etc.), so consumers
// import them from the barrel instead of reaching into `entities/issue.entity`.
export { IssueStatus, IssuePriority, IssueType } from './entities/issue.entity';

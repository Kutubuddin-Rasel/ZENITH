/**
 * Comments Module — Public Barrel (SEALED). First Level-4 [LIGHT] target.
 *
 * STRICT BOUNDARY: only the ISP contracts, the DI tokens, and the outbound
 * notification port are exported here. The decomposed CQRS services
 * (`CommentQueryService` / `CommentCommandService`), the
 * `TypeormCommentRepository`, the `Comment` entity, the DTOs, the
 * controller, and `CommentsModule` itself are module-internal — external
 * consumers speak to comments EXCLUSIVELY through the tokens below.
 *
 * Mirrors `issues/index.ts` export discipline. Continues the sealed chain
 * after the 7-module Level-3 set (`projects` → `boards` → `issues` →
 * `sprints` → `backlog` → `analytics` → `reports`).
 *
 * Step 3 SEALED this barrel: the legacy ~190-line `CommentsService` god
 * class was DELETED, its sole consumer (`attachments`) was migrated onto
 * `COMMENT_QUERY_TOKEN` (fixing the phantom-`update({})` audit/notification
 * bug → `assertEditable`), and the `no-restricted-imports` boundary lint
 * (`COMMENTS_DEEP_IMPORT_PATTERNS` in `eslint.config.mjs`) now bans every
 * deep path into the module internals.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `services/*`        → bound behind the ISP tokens below; never injected
 *                          as concrete classes. The legacy god class is gone.
 *  - `repositories/*`    → the persistence (ClickHouse-swap) seam; internal.
 *  - `entities/*`        → TypeORM persistence detail. Consumers speak the
 *                          `CommentView` projection, never the `Comment` class.
 *  - `utils/*`           → the opaque cursor codec; an internal detail of the
 *                          keyset read path.
 *  - `comments.controller` → HTTP entry point, not an injection target.
 *  - `dto/*`             → HTTP request shapes; consumers speak the typed
 *                          command specs on the ISP interfaces.
 *  - `CommentsModule`    → imported by direct path for NestJS DI membership
 *                          (`app.module` + `attachments.module`); not re-exported.
 *
 * To add a new public surface: add an interface to
 * `interfaces/comments.interfaces.ts` (or a port to `ports/`) and a token to
 * `constants/comments.tokens.ts`. Never re-export a class from here.
 */

export * from './interfaces/comments.interfaces';
export * from './constants/comments.tokens';
export * from './ports/comment-notification.port';

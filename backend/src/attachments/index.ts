/**
 * Attachments Module — Public Barrel (SEALED). Second Level-4 [LIGHT] target.
 *
 * STRICT BOUNDARY: only the ISP contracts, the DI tokens, and the canonicalized
 * storage port are exported here. The decomposed CQRS services
 * (`AttachmentQueryService` / `AttachmentCommandService`), the
 * `TypeormAttachmentRepository`, the `AttachmentTargetRegistry`, the
 * `Attachment` / `AttachmentHistory` entities, the DTOs, the upload/security
 * config, the controller, and `AttachmentsModule` itself are module-internal —
 * external consumers speak to attachments EXCLUSIVELY through the tokens below.
 *
 * Mirrors `comments/index.ts` export discipline. Continues the sealed chain
 * after the 7-module Level-3 set (`projects` → `boards` → `issues` →
 * `sprints` → `backlog` → `analytics` → `reports`) and the first Level-4
 * target (`comments`).
 *
 * Step 3 SEALED this barrel: the legacy ~407-line `AttachmentsService` god
 * class was DELETED (it was a confirmed leaf — zero external consumers), the
 * controller was cut over onto `ATTACHMENT_QUERY_TOKEN` /
 * `ATTACHMENT_COMMAND_TOKEN`, and the `no-restricted-imports` boundary lint
 * (`ATTACHMENTS_DEEP_IMPORT_PATTERNS` in `eslint.config.mjs`) now bans every
 * deep path into the module internals.
 *
 * NO ENTITY EXCEPTION (cleaner than comments): nothing outside the module
 * references the `Attachment` class — no CASL subject, no cross-module
 * `@ManyToOne` (the FK relations point OUT of attachments, never in).
 *
 * STORAGE STAYS PUBLIC: `storage/**` is NOT sealed — `S3StorageProvider` has
 * three legitimate external consumers (`email.module`, `email.processor`,
 * `scheduled-reports.processor`). The storage *port* (`IStoragePort` /
 * `FILE_STORAGE_PROVIDER`) is re-exported here so new consumers can speak the
 * abstraction; the concrete providers remain reachable at their direct path.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `services/*`        → bound behind the ISP tokens below; never injected
 *                          as concrete classes. The legacy god class is gone.
 *  - `repositories/*`    → the persistence (ClickHouse-swap) seam; internal.
 *  - `entities/*`        → TypeORM persistence detail. Consumers speak the
 *                          `AttachmentView` projection, never the entity class.
 *  - `utils/*`           → the pure target-spec resolver; an internal detail.
 *  - `config/*`          → Multer + magic-number + path-jail security helpers.
 *  - `attachments.controller` → HTTP entry point, not an injection target.
 *  - `dto/*`             → HTTP request shapes; consumers speak the typed
 *                          `AttachmentContext` / `UploadedFileMeta` specs.
 *  - `AttachmentsModule` → imported by direct path for NestJS DI membership
 *                          (`app.module`); not re-exported.
 *
 * To add a new public surface: add an interface to
 * `interfaces/attachments.interfaces.ts` and a token to
 * `constants/attachments.tokens.ts`. Never re-export a class from here.
 */

// ISP contracts + view projections + the IStoragePort/FileMetadata re-exports.
export * from './interfaces/attachments.interfaces';
// DI tokens (ATTACHMENT_QUERY/COMMAND/REPOSITORY) + the FILE_STORAGE_PROVIDER re-export.
export * from './constants/attachments.tokens';

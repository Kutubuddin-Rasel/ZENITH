// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Boards module — sealed barrel enforcement (Step 4).
 *
 * External consumers MUST import from `'../boards'` (the barrel at
 * `src/boards/index.ts`). Deep paths into the module's internals are
 * banned so the public surface stays constrained to:
 *   - `interfaces/boards.interfaces` (ISP contracts + view DTOs)
 *   - `constants/boards.tokens`      (DI tokens)
 *   - `enums/board-type.enum`        (`BoardType`)
 *   - `ports/workflow-lookup.port`   (outbound: consumed by workflows)
 *   - `ports/board-seed.port`        (outbound: consumed by project-templates)
 *
 * Persistence-layer entity imports (`boards/entities/*`) are
 * intentionally NOT banned — `database/`, `gateways/`, and
 * `revisions/` register the TypeORM entity directly. The barrel
 * deliberately omits entities; restricting entity paths would force a
 * useless re-export layer.
 *
 * The `boards.module.ts` deep path is also unrestricted because the
 * three legitimate cross-module imports (`app.module`,
 * `sprints.module`, `project-templates.module`) need the class
 * symbol for NestJS DI wiring. Runtime capabilities still flow
 * exclusively through the tokens and the `BoardSeedPort` exposed by
 * the barrel — the module-class import grants membership, not
 * service access.
 *
 * Override below re-allows deep imports inside `src/boards/**`
 * itself; the rule only applies to cross-module reach.
 */
const BOARDS_DEEP_IMPORT_PATTERNS = [
  {
    group: [
      // Concrete services — bound behind ISP tokens; never inject directly.
      '**/boards/services/**',
      '**/boards/services',
      // HTTP layer — entry point, not a dependency target.
      '**/boards/controllers/**',
      '**/boards/boards.controller',
      // HTTP request shapes — consumers speak typed command specs on
      // `BoardSeedPort` / `IBoardCommand`, not raw DTOs.
      '**/boards/dto/**',
      // Pure transform helpers, used only by internal services.
      '**/boards/mappers/**',
      // Constants / enums / interfaces / ports go through the barrel.
      '**/boards/constants/**',
      '**/boards/enums/**',
      '**/boards/interfaces/**',
      '**/boards/ports/**',
    ],
    message:
      "Boards is a sealed Level 3 module — import from '<rel>/boards' (the barrel) instead. Public surface: ISP tokens, ISP interfaces, BoardType, WorkflowLookupPort, BoardSeedPort. Entities for persistence registration are the lone exception (use the direct '/boards/entities/*' path).",
  },
];

/**
 * Issues module — sealed barrel enforcement (Step 4).
 *
 * The third Level 3 aggregate to be sealed (`projects` → `boards` →
 * `issues`). The 1386-line `IssuesService` god class was deleted; the
 * decomposed CQRS services live behind the ISP tokens. External
 * consumers MUST import from `'<rel>/issues'` (the barrel at
 * `src/issues/index.ts`). Public surface:
 *   - `interfaces/issues.interfaces` (ISP contracts + view DTOs)
 *   - `constants/issues.tokens`      (DI tokens)
 *   - the `IssueStatus` / `IssuePriority` / `IssueType` enums
 *   - `ports/*`                      (outbound: UserLookup / Audit /
 *                                     IssueBroadcast / Workflow lookups,
 *                                     bound by the capability-owner modules)
 *
 * Persistence-layer entity imports (`issues/entities/*`) are NOT banned —
 * `database/`, `gateways/`, `revisions/`, and the few domain consumers
 * that still register the TypeORM entity rely on the direct path, and the
 * three enums are re-exported through the barrel for the rest.
 *
 * `issues.module` is also unrestricted: `app.module` and the consumer
 * modules import the class symbol for NestJS DI membership. Runtime
 * capabilities still flow exclusively through the tokens / ports.
 *
 * The override below re-allows deep imports inside `src/issues/**`
 * itself; the rule targets only cross-module reach.
 */
const ISSUES_DEEP_IMPORT_PATTERNS = [
  {
    group: [
      // Concrete CQRS services — bound behind ISP tokens; never inject directly.
      '**/issues/services/**',
      '**/issues/services',
      // The deleted god class — banned so it can never be re-created as a target.
      '**/issues/issues.service',
      // HTTP layer — entry points, not dependency targets.
      '**/issues/issues.controller',
      '**/issues/issues.export.controller',
      '**/issues/issues.import.controller',
      '**/issues/timer.controller',
      // HTTP request shapes — consumers speak the typed ISP command specs.
      '**/issues/dto/**',
      // Pure transform helpers, used only by internal services.
      '**/issues/mappers/**',
      // Constants / interfaces / ports go through the barrel.
      '**/issues/constants/**',
      '**/issues/interfaces/**',
      '**/issues/ports/**',
    ],
    message:
      "Issues is a sealed Level 3 module — import from '<rel>/issues' (the barrel) instead. Public surface: ISP tokens, ISP interfaces, the IssueStatus/IssuePriority/IssueType enums, UserLookupPort, AuditPort, IssueBroadcastPort, WorkflowStatusLookupPort, WorkflowTransitionPolicyPort. Entities for persistence registration are the lone exception (use the direct '/issues/entities/*' path).",
  },
];

/**
 * Sprints module — sealed barrel enforcement (Step 4).
 *
 * The FINAL Level-4 aggregate to be sealed (`projects` → `boards` →
 * `issues` → `sprints`). The 869-line `SprintsService` god class was
 * deleted; the decomposed CQRS services live behind the ISP tokens.
 * External consumers MUST import from `'<rel>/sprints'` (the barrel at
 * `src/sprints/index.ts`). Public surface:
 *   - `interfaces/sprints.interfaces` (ISP contracts + view projections)
 *   - `constants/sprints.tokens`      (DI tokens)
 *   - the `SprintStatus` enum
 *
 * Persistence-layer entity imports (`sprints/entities/*`) are NOT banned —
 * `database/`, `reports/`, and the few domain consumers that register or
 * query the TypeORM entity rely on the direct path, and `SprintStatus` is
 * re-exported through the barrel for the rest.
 *
 * `sprints.module` is also unrestricted: `app.module` and the consumer
 * modules import the class symbol for NestJS DI membership. Runtime
 * capabilities still flow exclusively through the tokens.
 *
 * The override below re-allows deep imports inside `src/sprints/**`
 * itself; the rule targets only cross-module reach.
 */
const SPRINTS_DEEP_IMPORT_PATTERNS = [
  {
    group: [
      // Concrete CQRS services — bound behind ISP tokens; never inject directly.
      '**/sprints/services/**',
      '**/sprints/services',
      // The deleted god class — banned so it can never be re-created as a target.
      '**/sprints/sprints.service',
      // HTTP layer + cron — entry points, not dependency targets.
      '**/sprints/sprints.controller',
      '**/sprints/sprints.cron',
      // HTTP request shapes — consumers speak the typed ISP command specs.
      '**/sprints/dto/**',
      // Persistence + outbound wiring — internal to the module.
      '**/sprints/repositories/**',
      '**/sprints/adapters/**',
      '**/sprints/ports/**',
      // Constants / interfaces go through the barrel.
      '**/sprints/constants/**',
      '**/sprints/interfaces/**',
    ],
    message:
      "Sprints is a sealed Level 4 module — import from '<rel>/sprints' (the barrel) instead. Public surface: ISP tokens (SPRINT_QUERY/COMMAND/LIFECYCLE/MEMBERSHIP/METRICS/SNAPSHOT_TOKEN), ISP interfaces, the view projections, and the SprintStatus enum. Entities for persistence registration are the lone exception (use the direct '/sprints/entities/*' path).",
  },
];

const BACKLOG_DEEP_IMPORT_PATTERNS = [
  {
    group: [
      // Concrete CQRS services — bound behind ISP tokens; never inject directly.
      '**/backlog/services/**',
      '**/backlog/services',
      // The deleted god class — banned so it can never be re-created as a target.
      '**/backlog/backlog.service',
      // HTTP layer — entry point, not a dependency target.
      '**/backlog/backlog.controller',
      // Persistence (read projection / DIP seam) — internal to the module.
      '**/backlog/repositories/**',
      // HTTP request shapes — consumers speak the typed ISP contracts.
      '**/backlog/dto/**',
      // Constants / interfaces go through the barrel.
      '**/backlog/constants/**',
      '**/backlog/interfaces/**',
    ],
    message:
      "Backlog is a sealed Level 4 module — import from '<rel>/backlog' (the barrel) instead. Public surface: ISP tokens (BACKLOG_QUERY_TOKEN / BACKLOG_ORDERING_TOKEN), the ISP interfaces (IBacklogQuery / IBacklogOrdering), and the PaginatedBacklogResponse / BacklogPaginationMeta response types. The module class is the lone exception (use the direct '/backlog/backlog.module' path for DI membership).",
  },
];

const ANALYTICS_DEEP_IMPORT_PATTERNS = [
  {
    group: [
      // Decomposed CQRS services + the pure calculator — bound behind ISP
      // tokens; never inject the concrete classes. The deleted legacy
      // god-services lived here too — banned so they can't be re-created.
      '**/analytics/services/**',
      '**/analytics/services',
      // Outbound-port impls (OLTP read model + ProjectMetrics rollup) — the
      // ClickHouse-swap seam, internal to the module.
      '**/analytics/repositories/**',
      // Alerting subsystem — consumed only via its BullMQ queue boundary.
      '**/analytics/alerting/**',
      // HTTP layer — entry point, not a dependency target.
      '**/analytics/analytics.controller',
      // HTTP request shapes — consumers speak the typed ISP contracts.
      '**/analytics/dto/**',
      // Persistence entity (the rollup table / OLAP candidate) — internal.
      '**/analytics/entities/**',
      // Constants / interfaces go through the barrel.
      '**/analytics/constants/**',
      '**/analytics/interfaces/**',
    ],
    message:
      "Analytics is a sealed Level 3 module — import from '<rel>/analytics' (the barrel) instead. Public surface: ISP tokens (CYCLE_TIME / SPRINT_RISK / HISTORICAL_METRICS / STALLED_ISSUES_QUERY_TOKEN + ANALYTICS_AGGREGATION_JOB_TOKEN), the ISP interfaces (ICycleTimeQuery / ISprintRiskQuery / IHistoricalMetricsQuery / IStalledIssuesQuery / IAnalyticsAggregationJob), the result DTOs, and the MetricType enum. The module class is the lone exception (use the direct '/analytics/analytics.module' path for DI membership).",
  },
];

const REPORTS_DEEP_IMPORT_PATTERNS = [
  {
    group: [
      // CQRS read facade, the two O(1) dispatch registries, and the export
      // facade — bound behind the ISP tokens; never inject the concrete
      // classes. The deleted legacy god-classes (`ReportsService`,
      // `Pdf`/`ExcelExportService`) lived under here too — banned so they
      // cannot be re-created.
      '**/reports/services/**',
      '**/reports/services',
      // Per-report data-provider strategies — folded into the registry via
      // REPORT_DATA_PROVIDER_TOKEN.
      '**/reports/providers/**',
      // Format adapters — the `pdfkit`/`exceljs` isolation seam, folded via
      // REPORT_FORMATTER_TOKEN.
      '**/reports/formatters/**',
      // OLTP read-model impl (ClickHouse-swap seam) — internal.
      '**/reports/repositories/**',
      // BullMQ cron→queue→S3 pipeline — consumed only via its queue boundary.
      '**/reports/processors/**',
      // Pure helpers (ISO-week) — internal implementation detail.
      '**/reports/utils/**',
      // HTTP layer — entry point, not a dependency target.
      '**/reports/reports.controller',
      // Deleted god-class shim — banned so nothing re-imports/recreates it.
      '**/reports/reports.service',
      // HTTP request shapes — consumers speak the typed ISP contracts.
      '**/reports/dto/**',
      // Constants / interfaces go through the barrel.
      '**/reports/interfaces/**',
      '**/reports/constants/**',
    ],
    message:
      "Reports is a sealed Level 3 module — import from '<rel>/reports' (the barrel) instead. Public surface: the DI tokens (REPORT_EXPORTER_TOKEN / REPORT_DATA_PROVIDER_TOKEN / REPORT_FORMATTER_TOKEN / REPORTS_READ_MODEL_TOKEN), the ISP interfaces (IReportExporter / IReportDataProvider / IReportFormatter / IReportsReadModel), the canonical ReportTable view-model, and the ReportType / ReportFormat enums. The module class is the lone exception (use the direct '/reports/reports.module' path for DI membership).",
  },
];

/**
 * Comments module — sealed barrel enforcement (Step 3).
 *
 * The first Level-4 [LIGHT] target to be sealed, continuing the chain after
 * the 7-module Level-3 set (`projects` → `boards` → `issues` → `sprints` →
 * `backlog` → `analytics` → `reports`). The ~190-line `CommentsService` god
 * class was deleted; the decomposed CQRS services (`CommentQueryService` /
 * `CommentCommandService`) live behind the ISP tokens. External consumers
 * MUST import from `'<rel>/comments'` (the barrel at `src/comments/index.ts`).
 * Public surface:
 *   - `interfaces/comments.interfaces` (ISP contracts + the CommentView /
 *      Paginated/Keyset projections)
 *   - `constants/comments.tokens`      (DI tokens)
 *   - `ports/comment-notification.port` (outbound CommentNotificationPort)
 *
 * Persistence-layer entity imports (`comments/entities/*`) are NOT banned —
 * the CASL ability factory registers `Comment` as an ability subject and the
 * `Attachment` entity declares a TypeORM relation to it; both need the concrete
 * class, so the entity stays the lone exception (mirrors issues/boards/sprints).
 *
 * `comments.module` is also unrestricted: `app.module` and `attachments.module`
 * import the class symbol for NestJS DI membership. Runtime capabilities still
 * flow exclusively through the tokens / the notification port.
 *
 * The override below re-allows deep imports inside `src/comments/**` itself;
 * the rule targets only cross-module reach.
 */
const COMMENTS_DEEP_IMPORT_PATTERNS = [
  {
    group: [
      // Decomposed CQRS services — bound behind ISP tokens; never inject directly.
      '**/comments/services/**',
      '**/comments/services',
      // The deleted god class — banned so it can never be re-created as a target.
      '**/comments/comments.service',
      // Persistence (the ClickHouse-swap seam) — internal to the module.
      '**/comments/repositories/**',
      // Pure helpers (the opaque keyset cursor codec) — internal detail.
      '**/comments/utils/**',
      // HTTP layer — entry point, not a dependency target.
      '**/comments/comments.controller',
      // HTTP request shapes — consumers speak the typed ISP command specs.
      '**/comments/dto/**',
      // Constants / interfaces / ports go through the barrel.
      '**/comments/constants/**',
      '**/comments/interfaces/**',
      '**/comments/ports/**',
    ],
    message:
      "Comments is a sealed Level 4 module — import from '<rel>/comments' (the barrel) instead. Public surface: ISP tokens (COMMENT_QUERY_TOKEN / COMMENT_COMMAND_TOKEN / COMMENT_REPOSITORY_TOKEN), the ISP interfaces (ICommentQuery / ICommentCommand / ICommentRepository), the CommentView / PaginatedComments / KeysetComments projections, and the CommentNotificationPort. Entities for CASL subjects / TypeORM relations are the lone exception (use the direct '/comments/entities/*' path).",
  },
];

const ATTACHMENTS_DEEP_IMPORT_PATTERNS = [
  {
    group: [
      // Decomposed CQRS services + target registry — bound behind ISP tokens.
      '**/attachments/services/**',
      '**/attachments/services',
      // The deleted god class — banned so it can never be re-created as a target.
      '**/attachments/attachments.service',
      // Persistence (the ClickHouse-swap seam) — internal to the module.
      '**/attachments/repositories/**',
      // Pure target-spec resolver — internal detail.
      '**/attachments/utils/**',
      // Multer + magic-number + path-jail security helpers — internal.
      '**/attachments/config/**',
      // HTTP layer — entry point, not a dependency target.
      '**/attachments/attachments.controller',
      // HTTP request shapes — consumers speak AttachmentContext / UploadedFileMeta.
      '**/attachments/dto/**',
      // Constants / interfaces go through the barrel.
      '**/attachments/constants/**',
      '**/attachments/interfaces/**',
      // NB: `storage/**` is intentionally NOT banned — S3StorageProvider has
      // external consumers (email + reports); the port is re-exported via the
      // barrel. `entities/**` is unbanned too (no external references at all).
    ],
    message:
      "Attachments is a sealed Level 4 module — import from '<rel>/attachments' (the barrel) instead. Public surface: ISP tokens (ATTACHMENT_QUERY_TOKEN / ATTACHMENT_COMMAND_TOKEN / ATTACHMENT_REPOSITORY_TOKEN), the ISP interfaces (IAttachmentQuery / IAttachmentCommand / IAttachmentRepository), the AttachmentView / AttachmentHistoryView projections, and the IStoragePort / FILE_STORAGE_PROVIDER storage port. The storage providers under '/attachments/storage/*' stay public (shared with email + reports).",
  },
];

const RELEASES_DEEP_IMPORT_PATTERNS = [
  {
    group: [
      // Decomposed CQRS services — bound behind ISP tokens.
      '**/releases/services/**',
      '**/releases/services',
      // The deleted god class — banned so it can never be re-created as a target.
      '**/releases/releases.service',
      // Persistence (the ORM/ClickHouse-swap seam) — internal to the module.
      '**/releases/repositories/**',
      // Pure semver helpers — internal detail.
      '**/releases/utils/**',
      // SSRF webhook-validator / file-filter security helpers — internal.
      '**/releases/config/**',
      // HTTP layer — entry point, not a dependency target.
      '**/releases/releases.controller',
      // Constants / interfaces / ports go through the barrel.
      '**/releases/constants/**',
      '**/releases/interfaces/**',
      '**/releases/ports/**',
      // NB: `entities/**` is intentionally NOT banned — the `Release` class has
      // external references (revisions subscriber + the attachments TypeORM
      // relation). `dto/**` is unbanned too — search consumes
      // `paginated-response.dto` (a generic pagination util living here).
    ],
    message:
      "Releases is a sealed Level 4 module — import from '<rel>/releases' (the barrel) instead. Public surface: ISP tokens (RELEASE_QUERY_TOKEN / RELEASE_COMMAND_TOKEN / RELEASE_DEPLOYMENT_TOKEN / RELEASE_NOTES_TOKEN / RELEASE_REPOSITORY_TOKEN), the ISP interfaces (IReleaseQuery / IReleaseCommand / IReleaseDeployment / IReleaseNotes / IReleaseRepository) + view/result types, the ReleaseNotificationPort, and the ReleaseStatus / GitProvider enums. The Release entity ('/releases/entities/*') and the pagination DTO ('/releases/dto/*') stay deep-importable.",
  },
];

const NOTIFICATIONS_DEEP_IMPORT_PATTERNS = [
  {
    group: [
      // Decomposed CQRS services (read inbox + write router) — behind ISP tokens.
      '**/notifications/services/**',
      '**/notifications/services',
      // Persistence (the ClickHouse/raw-SQL swap seam) — internal to the module.
      '**/notifications/repositories/**',
      // Transport ports + their adapters — wired internally (gateway useExisting,
      // email adapter useClass); no external code provides transport.
      '**/notifications/ports/**',
      '**/notifications/adapters/**',
      // Event listeners + BullMQ/cron workers — plumbing, not injection targets.
      '**/notifications/listeners/**',
      '**/notifications/processors/**',
      // FULL entity seal (L3): no external TypeORM relation points INTO
      // Notification, so the class stays internal — the NotificationType /
      // NotificationStatus enums come from the barrel.
      '**/notifications/entities/**',
      // Event-payload + misc type detail.
      '**/notifications/types/**',
      // CursorPaginatedResult is re-exported via the barrel; the request DTO
      // class is internal to the controller.
      '**/notifications/dto/**',
      // Constants / interfaces go through the barrel.
      '**/notifications/constants/**',
      '**/notifications/interfaces/**',
      // The deleted god class — banned so it can never be re-created as a target.
      '**/notifications/notifications.service',
      // HTTP / WebSocket entry points — not dependency targets.
      '**/notifications/notifications.gateway',
      '**/notifications/notifications.controller',
    ],
    message:
      "Notifications is a sealed Level 3 module — import from '<rel>/notifications' (the barrel) instead. Public surface: the DI tokens (NOTIFICATION_INBOX_TOKEN / NOTIFICATION_ROUTER_TOKEN / NOTIFICATION_REPOSITORY_TOKEN), the ISP interfaces (INotificationInbox / INotificationRouter / INotificationRepository) + the NotificationView read type, the generic CursorPaginatedResult, and the NotificationType / NotificationStatus enums. The Notification entity, transport ports, gateway, and controller are internal (no deep imports).",
  },
];

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // Allow underscore prefix for intentionally unused variables/parameters
      // This is a standard TypeScript convention for interface-required params
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Boards + Issues sealed-barrel enforcement (Step 4). The
      // `@typescript-eslint` variant understands `import type` syntax,
      // which the core rule does not — several consumers import
      // `type IBoardQuery` / `type IIssueQuery` from the barrels.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            ...BOARDS_DEEP_IMPORT_PATTERNS,
            ...ISSUES_DEEP_IMPORT_PATTERNS,
            ...SPRINTS_DEEP_IMPORT_PATTERNS,
            ...BACKLOG_DEEP_IMPORT_PATTERNS,
            ...ANALYTICS_DEEP_IMPORT_PATTERNS,
            ...REPORTS_DEEP_IMPORT_PATTERNS,
            ...COMMENTS_DEEP_IMPORT_PATTERNS,
            ...ATTACHMENTS_DEEP_IMPORT_PATTERNS,
            ...RELEASES_DEEP_IMPORT_PATTERNS,
            ...NOTIFICATIONS_DEEP_IMPORT_PATTERNS,
          ],
        },
      ],
    },
  },
  {
    // Boards + Issues + Sprints + Backlog + Analytics + Reports + Comments module
    // internals are exempt — deep imports between sibling files inside
    // `src/boards/**` / `src/issues/**` / `src/sprints/**` / `src/backlog/**` /
    // `src/analytics/**` / `src/reports/**` / `src/comments/**` are how each
    // module is organized. The lint targets *cross-module* reach.
    files: [
      'src/boards/**/*.ts',
      'src/issues/**/*.ts',
      'src/sprints/**/*.ts',
      'src/backlog/**/*.ts',
      'src/analytics/**/*.ts',
      'src/reports/**/*.ts',
      'src/comments/**/*.ts',
      'src/attachments/**/*.ts',
      'src/releases/**/*.ts',
      'src/notifications/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },
);

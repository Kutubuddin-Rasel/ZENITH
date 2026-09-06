/**
 * Projects Module — Public Barrel (SEALED, Step 4)
 *
 * STRICT BOUNDARY: only abstract contracts, DI tokens, and the
 * outbound `TemplateApplicationPort` are exported. Concrete services,
 * TypeORM entities, repositories, the HTTP controllers, and the
 * `ProjectsModule` class itself are module-internal and must be
 * consumed exclusively through the tokens declared in
 * `constants/projects.tokens.ts`.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `projects.module`                 → `app.module.ts` imports the
 *                                        class by direct path; no other
 *                                        module should.
 *  - `services/*`                      → bound behind ISP tokens
 *                                        (`PROJECT_QUERY_TOKEN`,
 *                                        `PROJECT_COMMAND_TOKEN`,
 *                                        `PROJECT_METRICS_TOKEN`,
 *                                        `PROJECT_ACCESS_QUERY_TOKEN`,
 *                                        `PROJECT_ACCESS_COMMAND_TOKEN`,
 *                                        `PROJECT_SECURITY_POLICY_TOKEN`);
 *                                        never injected as concrete
 *                                        classes. The legacy
 *                                        `ProjectsService` god-class
 *                                        was deleted in Step 3.
 *  - `entities/*`                      → TypeORM persistence detail.
 *                                        Public DTO projections on
 *                                        `IProjectQuery`,
 *                                        `IProjectCommand`,
 *                                        `IProjectMetrics`, etc.
 *                                        (`ProjectSummary`,
 *                                        `ProjectWithMembership`,
 *                                        `ProjectAccessView`,
 *                                        `ProjectSecurityPolicyView`,
 *                                        `ProjectMetricsView`,
 *                                        `ProjectActivityEntry`)
 *                                        replace them across the
 *                                        boundary.
 *  - `adapters/*`                      → `AuditLogWriterAdapter` is
 *                                        bound internally to
 *                                        `AUDIT_LOG_WRITER_TOKEN`;
 *                                        `ProjectLookupAdapter` is
 *                                        bound to invites'
 *                                        `ProjectLookupPort`. Neither
 *                                        is part of the public
 *                                        surface.
 *  - `controllers/*`,
 *    `projects.controller`,
 *    `project-security-policy.controller`
 *                                      → HTTP entry points, not for
 *                                        injection.
 *  - `dto/*`                           → HTTP request shapes; consumers
 *                                        speak the typed command DTOs
 *                                        on `IProjectCommand` /
 *                                        `IProjectAccessCommand`.
 *  - `TypeOrmModule`                   → no
 *                                        `@InjectRepository(Project*)`
 *                                        is permitted outside
 *                                        `database/repositories/`
 *                                        (enforced by the Step 4
 *                                        boundary sweep and by
 *                                        `projects.module.ts` NOT
 *                                        re-exporting `TypeOrmModule`).
 *
 * The outbound `TemplateApplicationPort` IS exported so the
 * `project-templates` module can bind a concrete
 * `TemplateApplicationAdapter` and satisfy the inverted dependency
 * without re-introducing the legacy `forwardRef(() =>
 * TemplateApplicationService)` cycle that lived inside the old
 * `ProjectsService.create()`.
 *
 * If you need to add a new public surface, add an interface to
 * `interfaces/projects.interfaces.ts` and a token to
 * `constants/projects.tokens.ts`. Never re-export a class from here.
 */

export * from './interfaces/projects.interfaces';
export * from './constants/projects.tokens';
export * from './ports/template-application.port';

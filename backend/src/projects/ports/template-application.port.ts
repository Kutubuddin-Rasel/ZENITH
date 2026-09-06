/**
 * Projects Module — Outbound Port: TemplateApplicationPort
 *
 * The projects command service needs to apply an optional template
 * (`Project.templateId`) atomically with `create()`. Today this is
 * accomplished via `@Optional() @Inject(forwardRef(() =>
 * TemplateApplicationService))` — a circular dependency hint paired
 * with the matching `forwardRef(() => ProjectsModule)` in
 * `project-templates.module.ts:30`.
 *
 * Reaching into `TemplateApplicationService` directly re-introduces
 * the `ProjectsModule ↔ ProjectTemplatesModule` cycle. The fix
 * mirrors the pattern that eliminated the `invites ↔ projects`
 * cycle:
 *
 *   - the *consumer* (projects) declares the abstract port here, and
 *   - the *owner* of the capability (project-templates) provides
 *     the concrete adapter binding via a normal
 *     `imports: [ProjectsModule]` edge.
 *
 * After Step 3:
 *   - `ProjectCommandService` injects `TemplateApplicationPort`.
 *   - `ProjectTemplatesModule` removes its `forwardRef(() =>
 *     ProjectsModule)` and provides
 *     `{ provide: TemplateApplicationPort, useClass:
 *        TemplateApplicationAdapter }` — re-exporting the abstract.
 *   - `ProjectsModule` removes the `forwardRef` /
 *     `@Optional()` injection.
 *
 * The arrow becomes one-way (project-templates → projects) and the
 * module graph stays acyclic.
 *
 * Transactional rationale for `manager?: EntityManager`
 * -----------------------------------------------------
 * `ProjectCommandService.create()` is transactional via
 * `dataSource.transaction(async manager => ...)`. To keep the
 * template-application write inside the same transaction (so a
 * template-seed failure rolls back the project row), the port
 * accepts an optional `EntityManager`. Adapters MUST use the
 * passed-in manager when present, and fall back to their own
 * `DataSource` / `Repository<T>` when absent (so non-transactional
 * future callers stay binary-compatible).
 *
 * Abstract-class-as-DI-token: NestJS resolves the binding by
 * reference identity on the class symbol, mirroring how
 * `ProjectLookupPort` (consumed by `InviteCommandService`) doubles
 * as its own token.
 */

import type { EntityManager } from 'typeorm';

export abstract class TemplateApplicationPort {
  /**
   * Apply the named template to the project (seeds workflow,
   * statuses, default sprints, suggested labels, etc. as defined by
   * the template).
   *
   * @param projectId    UUID of the freshly-created project.
   * @param templateId   UUID of the template to apply.
   * @param actorUserId  Caller id — used as the `changedBy` value
   *                     on any revision rows the template seeder
   *                     emits.
   * @param manager      Optional transactional `EntityManager`.
   *                     When provided, the adapter MUST execute all
   *                     writes through this manager so the seeded
   *                     rows participate in the parent transaction.
   *                     When omitted, the adapter falls back to its
   *                     own data source (legacy callers).
   *
   * Implementations MUST throw rather than swallow seeding failures
   * — `ProjectCommandService.create()` relies on the throw to roll
   * back the enclosing transaction.
   */
  abstract applyTemplate(
    projectId: string,
    templateId: string,
    actorUserId: string,
    manager?: EntityManager,
  ): Promise<void>;
}

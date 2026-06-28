/**
 * Boards Module — Outbound Port: WorkflowLookupPort
 *
 * `BoardOrderingService.moveIssue` (Step 3) needs the `name` of a
 * `WorkflowStatus` row to keep the legacy `Issue.status` string in
 * sync with the relational-status migration's `Issue.statusId` FK.
 *
 * Today (Step 0) this is done via
 *   `this.dataSource.getRepository(WorkflowStatus).findOne(...)`
 * — a direct reach across the workflows aggregate boundary that
 * violates DIP (severity CRITICAL per `SOLID_STANDARDS.md`) and ties
 * the boards module to the `WorkflowStatus` TypeORM entity shape.
 *
 * Inversion strategy
 * ------------------
 * The workflows module currently has no sealed barrel, no tokens,
 * and no public interfaces — refactoring it is out of scope. So
 * boards (the *consumer*) owns the contract here, and workflows
 * (the *capability owner*) binds the adapter in Step 2:
 *
 *   - boards declares `WorkflowLookupPort` (this file).
 *   - workflows provides
 *     `{ provide: WorkflowLookupPort, useClass: WorkflowLookupAdapter }`
 *     and re-exports it.
 *   - `BoardsModule` imports `WorkflowsModule` (already does today)
 *     and consumes the port via abstract-class injection.
 *
 * This is the exact mirror of how `projects` consumes
 * `TemplateApplicationPort` — owner of the *contract* and owner of
 * the *capability* are intentionally distinct.
 *
 * Why not return the entity? The narrow `WorkflowStatusLookup`
 * projection below carries only `id` and `name` — the only two
 * fields `moveIssue` reads. Returning a slim DTO keeps the
 * workflows entity shape free to evolve without rippling through
 * boards.
 *
 * Why a class (not an interface)? NestJS resolves the binding by
 * reference identity on the class symbol — abstract classes double
 * as their own DI tokens, mirroring `BoardRepository`,
 * `TemplateApplicationPort`, and `ProjectLookupPort`. Using an
 * interface would force a parallel `Symbol` token.
 */

/**
 * Slim projection of a `WorkflowStatus` row — only the fields
 * `BoardOrderingService.moveIssue` consumes. Excludes the
 * `category`, `color`, and the back-pointer to `Project`. Returning
 * `null` (rather than throwing) lets the caller decide whether a
 * missing status is a 404 (`moveIssue`) or a degenerate-but-OK case
 * (future analytics).
 */
export interface WorkflowStatusLookup {
  readonly id: string;
  readonly name: string;
}

export abstract class WorkflowLookupPort {
  /**
   * Resolve a `WorkflowStatus` row by `(projectId, statusId)`.
   * Returns `null` when no row matches — the caller is responsible
   * for raising `NotFoundException` with the appropriate message.
   *
   * The `projectId` filter is mandatory (NOT optional) — every
   * `WorkflowStatus` is project-scoped, and skipping the filter
   * would allow cross-tenant status reads.
   *
   * @param projectId  UUID of the project the status belongs to.
   * @param statusId   UUID of the target `WorkflowStatus`.
   */
  abstract findStatus(
    projectId: string,
    statusId: string,
  ): Promise<WorkflowStatusLookup | null>;
}

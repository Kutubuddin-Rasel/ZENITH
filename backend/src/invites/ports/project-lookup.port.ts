/**
 * Invites Module — Outbound Port: ProjectLookupPort
 *
 * The invites command service needs the project's `name` so it can
 * hydrate the `ProjectSummary` carried by every
 * `INVITES_EVENTS.*` payload (notification copy, activity feed,
 * webhook).
 *
 * Reaching into `ProjectsService` directly would re-introduce the
 * historical `InvitesModule → ProjectsModule → InvitesModule`
 * `forwardRef` cycle (see `invites.module.ts:22` and
 * `projects.module.ts:37` before Step 3).
 *
 * The fix is the same pattern the membership module uses for RBAC:
 * the *consumer* (invites) declares the abstract port, and the
 * *owner* of the data (projects) provides the concrete adapter
 * binding via a normal `imports: [ProjectsModule]` edge. This keeps
 * the dependency arrow one-way (invites → projects) and lets the
 * module graph stay acyclic.
 *
 * The adapter lives under `backend/src/projects/adapters/` and is
 * bound to this token inside `ProjectsModule` (Step 3). The invites
 * module does not — and must not — know about the adapter class.
 *
 * Abstract-class-as-DI-token: NestJS resolves the binding by
 * reference identity on the class symbol, mirroring how
 * `AbstractProjectMemberRepository` doubles as its own token in the
 * membership module.
 */

/** Lightweight projection of a project, scoped to invite-event hydration. */
export interface ProjectSummaryView {
  readonly id: string;
  readonly name: string;
}

export abstract class ProjectLookupPort {
  /**
   * Resolve a project to its summary projection. Returns `null` if
   * the project does not exist; consumers MUST handle this case
   * defensively (e.g., skip event emission rather than throwing) so
   * the invite mutation does not fail just because a project was
   * deleted between the guard check and the event dispatch.
   */
  abstract findProjectSummary(
    projectId: string,
  ): Promise<ProjectSummaryView | null>;
}

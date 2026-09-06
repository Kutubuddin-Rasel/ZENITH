import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ProjectLookupPort,
  ProjectSummaryView,
} from '../../invites/ports/project-lookup.port';
import { PROJECT_QUERY_TOKEN } from '../constants/projects.tokens';
import type { IProjectQuery } from '../interfaces/projects.interfaces';

/**
 * ProjectLookupAdapter
 *
 * Canonical implementation of the invites outbound port
 * (`ProjectLookupPort`). Lives inside the projects module — the
 * rightful owner of the `projects` aggregate — so the invites module
 * never reaches across into `ProjectsService` directly.
 *
 * Cycle-break rationale
 * ---------------------
 * Before Step 3, `InvitesService` injected concrete `ProjectsService`
 * for event-payload hydration. That dependency, combined with
 * `ProjectsService` injecting `InvitesService` for `getInvites()`,
 * forced both modules to use `forwardRef(...)` against each other —
 * an unstable, hard-to-reason-about cycle.
 *
 * The fix mirrors how membership binds the RBAC role-usage probe:
 * the *consumer* (invites) declares the abstract port, and the
 * *owner* of the data (projects) provides the concrete adapter
 * binding. The dependency arrow is now one-way (`InvitesModule →
 * ProjectsModule`) and the cycle is eliminated.
 *
 * Bound to `ProjectLookupPort` inside `ProjectsModule` and re-exported
 * so the (non-`@Global()`) `InvitesModule` receives the binding
 * through a normal `imports: [ProjectsModule]` edge.
 *
 * Null-safety
 * -----------
 * `ProjectsService.findOneById` throws `NotFoundException` when the
 * project is missing, but the port contract returns `null` on
 * not-found so consumers can degrade gracefully (the invite mutation
 * should not fail just because a project was deleted between the
 * guard check and the event dispatch). This adapter catches the
 * not-found error and returns `null` instead of propagating it.
 */
@Injectable()
export class ProjectLookupAdapter extends ProjectLookupPort {
  private readonly logger = new Logger(ProjectLookupAdapter.name);

  constructor(
    @Inject(PROJECT_QUERY_TOKEN)
    private readonly projects: IProjectQuery,
  ) {
    super();
  }

  async findProjectSummary(
    projectId: string,
  ): Promise<ProjectSummaryView | null> {
    try {
      const project = await this.projects.findById(projectId);
      return { id: project.id, name: project.name };
    } catch (error) {
      // Tolerate not-found / tenant-scope misses so the caller can
      // emit the event with a degraded payload rather than aborting
      // the entire mutation.
      this.logger.debug(
        `Project lookup failed for ${projectId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }
}

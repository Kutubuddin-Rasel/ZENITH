import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TemplateApplicationPort } from '../../projects';
import { TemplateApplicationService } from '../services/template-application.service';

/**
 * TemplateApplicationAdapter
 *
 * Canonical implementation of the projects outbound port
 * (`TemplateApplicationPort`). Lives inside the project-templates
 * module — the owner of the templates aggregate — so the projects
 * module never reaches across into `TemplateApplicationService`
 * directly.
 *
 * Cycle-break rationale
 * ---------------------
 * Before Step 3, `ProjectsService.create()` injected concrete
 * `TemplateApplicationService` (with `forwardRef`). That dependency,
 * combined with `ProjectTemplatesModule` injecting `Project` via
 * `forwardRef(() => ProjectsModule)`, forced both modules to use
 * `forwardRef(...)` against each other — an unstable cycle.
 *
 * The fix mirrors how `ProjectsModule` binds the `ProjectLookupPort`
 * adapter for invites: the *consumer* (projects) declares the
 * abstract port, and the *owner* of the capability (project-templates)
 * provides the concrete adapter binding via a normal
 * `imports: [ProjectsModule]` edge. The arrow is now one-way
 * (project-templates → projects) and the cycle is eliminated.
 *
 * Routing semantics (manager present vs absent)
 * --------------------------------------------
 * The legacy `TemplateApplicationService` exposes two variants:
 *
 *  1. `applyTemplate(projectId, templateId, userId)` — non-transactional,
 *     SWALLOWS errors (legacy callers cannot tolerate cascading
 *     partial-failure).
 *  2. `applyTemplateTransactional(manager, projectId, templateId, userId)` —
 *     transactional, THROWS on failure (the orchestrator relies on the
 *     throw to roll back the parent transaction).
 *
 * The adapter routes by `manager` presence:
 *  - manager defined  → call (2), throws propagate, parent
 *                       `dataSource.transaction(...)` rolls back.
 *  - manager omitted  → call (1), legacy swallow-and-warn behaviour
 *                       preserved.
 */
@Injectable()
export class TemplateApplicationAdapter extends TemplateApplicationPort {
  constructor(
    private readonly templateApplicationService: TemplateApplicationService,
  ) {
    super();
  }

  async applyTemplate(
    projectId: string,
    templateId: string,
    actorUserId: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (manager) {
      await this.templateApplicationService.applyTemplateTransactional(
        manager,
        projectId,
        templateId,
        actorUserId,
      );
      return;
    }
    await this.templateApplicationService.applyTemplate(
      projectId,
      templateId,
      actorUserId,
    );
  }
}

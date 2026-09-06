import { Injectable } from '@nestjs/common';

// Sealed-barrel consumption: the port + DTO come from `issues/index.ts`.
import { WorkflowStatusLookupPort, WorkflowStatusInfo } from '../../issues';
import { WorkflowStatusesService } from '../services/workflow-statuses.service';

/**
 * WorkflowStatusLookupAdapter — capability-owner side of the issues →
 * workflows status-lookup inversion.
 *
 * Implements the issues-owned `WorkflowStatusLookupPort` by delegating to
 * `WorkflowStatusesService` and projecting each `WorkflowStatus` down to the
 * `{ id, name, projectId }` slice issues reads. Bound + re-exported by
 * `WorkflowsModule` (already imported by `issues.module`), exactly as that
 * module already binds boards' `WorkflowLookupPort`.
 */
@Injectable()
export class WorkflowStatusLookupAdapter extends WorkflowStatusLookupPort {
  constructor(private readonly statuses: WorkflowStatusesService) {
    super();
  }

  async findById(statusId: string): Promise<WorkflowStatusInfo | null> {
    const status = await this.statuses.findById(statusId);
    return status
      ? { id: status.id, name: status.name, projectId: status.projectId }
      : null;
  }

  async getDefaultStatus(
    projectId: string,
  ): Promise<WorkflowStatusInfo | null> {
    const status = await this.statuses.getDefaultStatus(projectId);
    return status
      ? { id: status.id, name: status.name, projectId: status.projectId }
      : null;
  }

  async findByProjectAndName(
    projectId: string,
    name: string,
  ): Promise<WorkflowStatusInfo | null> {
    const status = await this.statuses.findByProjectAndName(projectId, name);
    return status
      ? { id: status.id, name: status.name, projectId: status.projectId }
      : null;
  }
}

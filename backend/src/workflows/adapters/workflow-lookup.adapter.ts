import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Sealed-barrel consumption (Step 4): the port + its return DTO are
// exported from `boards/index.ts` — adapters never reach into
// `boards/ports/*` directly.
import { WorkflowLookupPort, WorkflowStatusLookup } from '../../boards';
import { WorkflowStatus } from '../entities/workflow-status.entity';

/**
 * WorkflowLookupAdapter — capability-owner side of the inversion.
 *
 * Implements the `WorkflowLookupPort` contract that lives in
 * `boards/ports/workflow-lookup.port.ts`. The boards module owns the contract
 * (consumer); workflows binds the adapter (capability owner). Mirrors the
 * `TemplateApplicationPort` precedent that broke the
 * `ProjectsModule ↔ ProjectTemplatesModule` cycle in the prior refactor.
 *
 * The returned `WorkflowStatusLookup` projection is a narrow slice of the
 * `WorkflowStatus` entity (`id` + `name` only), so the workflows entity
 * shape can evolve without rippling through boards.
 */
@Injectable()
export class WorkflowLookupAdapter extends WorkflowLookupPort {
  constructor(
    @InjectRepository(WorkflowStatus)
    private readonly statusRepo: Repository<WorkflowStatus>,
  ) {
    super();
  }

  async findStatus(
    projectId: string,
    statusId: string,
  ): Promise<WorkflowStatusLookup | null> {
    const status = await this.statusRepo.findOne({
      where: { id: statusId, projectId },
      select: { id: true, name: true },
    });
    return status ? { id: status.id, name: status.name } : null;
  }
}

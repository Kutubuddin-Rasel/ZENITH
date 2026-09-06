import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { Issue } from '../entities/issue.entity';
import { IssueRepository } from '../../database/repositories/issue.repository';
import type { IIssueRanking, IssueView } from '../interfaces/issues.interfaces';

/**
 * IssueRankingService — the SINGLE WRITER of `Issue.backlogOrder`.
 *
 * Bound to `ISSUE_RANKING_TOKEN`; consumed by the backlog module
 * (`BACKLOG_ORDERING_TOKEN`) so the backlog never holds a raw
 * `Repository<Issue>` and the single-writer invariant (only the Issue
 * aggregate mutates `issues` rows) is restored.
 *
 * Correctness fixes vs. the legacy `BacklogService` it replaces:
 *  - `reorderBacklog` is a fully **parameterised** bulk update —
 *    `unnest($1::uuid[], $2::int[])` joins the IDs to their target
 *    positions, so the SQL text is static and the legacy
 *    string-interpolated `CASE id WHEN '${id}' THEN ${idx}` injection
 *    surface is gone.
 *  - `moveBacklogItem` runs its fetch-splice-renumber-persist cycle
 *    inside a single transaction — the legacy `save(all)` was
 *    non-transactional, so a mid-renumber failure left the backlog
 *    half-ordered.
 *
 * Both methods honor EntityManager Passthrough (mirroring
 * `IIssueTransition.updateStatus`): a supplied `manager` makes the write
 * JOIN the caller's `dataSource.transaction`; otherwise the method opens
 * its own. Reads use the abstract `IssueRepository` (DIP); writes go
 * through the `EntityManager` because the repository exposes no manager
 * surface.
 */
@Injectable()
export class IssueRankingService implements IIssueRanking {
  constructor(
    private readonly issues: IssueRepository,
    private readonly dataSource: DataSource,
  ) {}

  async reorderBacklog(
    projectId: string,
    issueIds: string[],
    manager?: EntityManager,
  ): Promise<void> {
    if (issueIds.length === 0) return;

    // Parallel arrays: position[i] is the new backlogOrder for issueIds[i].
    const positions = issueIds.map((_, idx) => idx);

    const run = async (m: EntityManager): Promise<void> => {
      // Static SQL — every value is a bind parameter; no interpolation.
      // Scoped by projectId so a foreign ID in the array is a no-op.
      await m.query(
        `UPDATE issues AS i
         SET "backlogOrder" = c.ord
         FROM unnest($1::uuid[], $2::int[]) AS c(id, ord)
         WHERE i.id = c.id AND i."projectId" = $3`,
        [issueIds, positions, projectId],
      );
    };

    if (manager) {
      await run(manager);
    } else {
      await this.dataSource.transaction(run);
    }
  }

  async moveBacklogItem(
    projectId: string,
    issueId: string,
    newPosition: number,
    manager?: EntityManager,
  ): Promise<IssueView[]> {
    // Deterministic snapshot of the project's ordered issues.
    const all = await this.issues.findByProject(projectId, {
      order: { backlogOrder: 'ASC', createdAt: 'ASC' },
    });

    const idx = all.findIndex((i) => i.id === issueId);
    if (idx === -1) {
      throw new NotFoundException(`Issue ${issueId} not in backlog`);
    }

    const [moving] = all.splice(idx, 1);
    const newPos = Math.min(Math.max(newPosition, 0), all.length);
    all.splice(newPos, 0, moving);

    // Renumber the whole slice so positions stay contiguous.
    all.forEach((issue, i) => {
      issue.backlogOrder = i;
    });

    // ACID: the multi-row renumber commits atomically (joining the
    // caller's tx when supplied) — the legacy `save(all)` did not.
    const persist = (m: EntityManager): Promise<Issue[]> => m.save(all);
    return manager ? persist(manager) : this.dataSource.transaction(persist);
  }
}

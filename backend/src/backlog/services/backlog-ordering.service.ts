import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { ISSUE_RANKING_TOKEN } from '../../issues';
import type { IIssueRanking, IssueView } from '../../issues';

import { BacklogCacheService } from './backlog-cache.service';
import { MoveBacklogItemDto } from '../dto/move-backlog-item.dto';
import type { IBacklogOrdering } from '../interfaces/backlog.interfaces';

/**
 * BacklogOrderingService — the WRITE surface (`IBacklogOrdering`).
 *
 * Enforces the project-role authorization rules (unchanged from the legacy
 * god class: `moveItem` → PROJECT_LEAD only; `reorderItems` → PROJECT_LEAD or
 * MEMBER), then DELEGATES every Issue-row mutation to the issues aggregate
 * via `ISSUE_RANKING_TOKEN` (EntityManager passthrough). Restores the
 * single-writer invariant: the backlog never touches `issues` rows directly.
 * Invalidates the read cache after each successful mutation.
 */
@Injectable()
export class BacklogOrderingService implements IBacklogOrdering {
  constructor(
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly members: IProjectMemberQuery,
    @Inject(ISSUE_RANKING_TOKEN)
    private readonly ranking: IIssueRanking,
    private readonly cache: BacklogCacheService,
  ) {}

  async moveItem(
    projectId: string,
    userId: string,
    dto: MoveBacklogItemDto,
  ): Promise<IssueView[]> {
    const role = await this.members.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can reorder backlog');
    }

    const result = await this.ranking.moveBacklogItem(
      projectId,
      dto.issueId,
      dto.newPosition,
    );

    await this.cache.invalidate(projectId);
    return result;
  }

  async reorderItems(
    projectId: string,
    userId: string,
    issueIds: string[],
  ): Promise<void> {
    const role = await this.members.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD && role !== ProjectRole.MEMBER) {
      throw new ForbiddenException(
        'You do not have permission to reorder the backlog',
      );
    }

    if (issueIds.length === 0) return;

    await this.ranking.reorderBacklog(projectId, issueIds);
    await this.cache.invalidate(projectId);
  }
}

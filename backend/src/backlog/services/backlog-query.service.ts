import { Inject, Injectable } from '@nestjs/common';

import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import type { IssueView } from '../../issues';

import { BacklogReadRepository } from '../repositories/abstract/backlog-read.repository.abstract';
import { BacklogCacheService } from './backlog-cache.service';
import {
  BacklogQueryDto,
  BACKLOG_PAGINATION,
  createBacklogPaginatedResponse,
} from '../dto/backlog-query.dto';
import type {
  IBacklogQuery,
  PaginatedBacklogResponse,
} from '../interfaces/backlog.interfaces';

/**
 * BacklogQueryService — the cached READ surface (`IBacklogQuery`).
 *
 * SRP: membership authorization + cache get/set + a single read through the
 * backlog-owned `BacklogReadRepository` projection (the ClickHouse-isolation
 * seam). Holds NO `Repository<Issue>` and performs NO writes — the
 * single-writer invariant lives entirely on the issues side now.
 *
 * Returns the `IssueView` projection, never the `Issue` entity.
 */
@Injectable()
export class BacklogQueryService implements IBacklogQuery {
  constructor(
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly members: IProjectMemberQuery,
    private readonly reads: BacklogReadRepository,
    private readonly cache: BacklogCacheService,
  ) {}

  async getBacklog(
    projectId: string,
    userId: string,
    query?: BacklogQueryDto,
  ): Promise<PaginatedBacklogResponse<IssueView>> {
    // Membership assertion (throws if the user is not a project member).
    await this.members.getUserRole(projectId, userId);

    const page = query?.page ?? 1;
    const limit = query?.limit ?? BACKLOG_PAGINATION.DEFAULT_LIMIT;

    const cached = await this.cache.readPage<
      PaginatedBacklogResponse<IssueView>
    >(projectId, page, limit);
    if (cached) {
      return cached;
    }

    const skip = (page - 1) * limit;
    const [data, total] = await this.reads.findBacklogPage(
      projectId,
      skip,
      limit,
    );

    const response = createBacklogPaginatedResponse(data, page, limit, total);
    await this.cache.writePage(projectId, page, limit, response);

    return response;
  }
}

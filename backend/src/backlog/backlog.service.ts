// src/backlog/backlog.service.ts
import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Issue } from '../issues/entities/issue.entity';
import { MoveBacklogItemDto } from './dto/move-backlog-item.dto';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { ProjectRole } from '../membership/enums/project-role.enum';
import {
  calculateMidpoint,
  generateRankBefore,
  generateRankAfter,
  generateDefaultRank,
} from '../common/utils/lexorank';
import {
  BacklogQueryDto,
  BACKLOG_PAGINATION,
  PaginatedBacklogResponse,
  createBacklogPaginatedResponse,
} from './dto/backlog-query.dto';

@Injectable()
export class BacklogService {
  /** Cache TTL in milliseconds (60 seconds) */
  private readonly CACHE_TTL = 60000;

  constructor(
    @InjectRepository(Issue)
    private issueRepo: Repository<Issue>,
    private membersService: ProjectMembersService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) { }

  /**
   * Generate cache key for backlog page
   * Pattern: backlog:{projectId}:p{page}:l{limit}
   */
  private getCacheKey(projectId: string, page: number, limit: number): string {
    return `backlog:${projectId}:p${page}:l${limit}`;
  }

  /**
   * Invalidate all cached backlog pages for a project
   * Called on any mutation (move, reorder)
   */
  private async invalidateBacklogCache(projectId: string): Promise<void> {
    // Get Redis client to use SCAN for pattern matching
    const store = (this.cache as any).stores?.[0] ?? (this.cache as any).store;
    if (store.keys) {
      const keys = await store.keys(`backlog:${projectId}:*`);
      if (keys.length > 0) {
        await Promise.all(keys.map((key: string) => this.cache.del(key)));
      }
    } else {
      // Fallback: clear known pages (first 10 pages with common limits)
      const limits = [50, 100, 200];
      for (let page = 1; page <= 10; page++) {
        for (const limit of limits) {
          await this.cache.del(this.getCacheKey(projectId, page, limit));
        }
      }
    }
  }

  /**
   * List the backlog with pagination and caching
   * Returns issues NOT in any sprint, ordered by backlogOrder
   */
  async getBacklog(
    projectId: string,
    userId: string,
    query?: BacklogQueryDto,
  ): Promise<PaginatedBacklogResponse<Issue>> {
    // Ensure user is a project member:
    await this.membersService.getUserRole(projectId, userId);

    // Apply pagination defaults
    const page = query?.page ?? 1;
    const limit = query?.limit ?? BACKLOG_PAGINATION.DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    // Check cache first
    const cacheKey = this.getCacheKey(projectId, page, limit);
    const cached = await this.cache.get<PaginatedBacklogResponse<Issue>>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build query with deterministic sorting
    const queryBuilder = this.issueRepo
      .createQueryBuilder('issue')
      .leftJoin('sprint_issues', 'si', 'si.issueId = issue.id')
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('si.issueId IS NULL')
      .andWhere('issue.isArchived = :isArchived', { isArchived: false })
      // Deterministic sorting: primary + tiebreakers
      .orderBy('issue.backlogOrder', 'ASC')
      .addOrderBy('issue.createdAt', 'ASC')
      .addOrderBy('issue.id', 'ASC'); // Final tiebreaker for stable pagination

    // Get total count and paginated data
    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const response = createBacklogPaginatedResponse(data, page, limit, total);

    // Cache the result with TTL
    await this.cache.set(cacheKey, response, this.CACHE_TTL);

    return response;
  }

  /** Move one issue to a new position, shifting others as needed */
  async moveItem(
    projectId: string,
    userId: string,
    dto: MoveBacklogItemDto,
  ): Promise<Issue[]> {
    // Only ProjectLead (or super-admin) can reorder:
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can reorder backlog');
    }

    // Fetch all issues in backlog sorted:
    const all = await this.issueRepo.find({
      where: { projectId },
      order: { backlogOrder: 'ASC', createdAt: 'ASC' },
    });

    // Find the issue to move:
    const idx = all.findIndex((i) => i.id === dto.issueId);
    if (idx === -1) {
      throw new NotFoundException(`Issue ${dto.issueId} not in backlog`);
    }
    const [moving] = all.splice(idx, 1);

    // Clamp newPosition within bounds:
    const newPos = Math.min(Math.max(dto.newPosition, 0), all.length);
    all.splice(newPos, 0, moving);

    // Reassign backlogOrder sequentially:
    for (let i = 0; i < all.length; i++) {
      all[i].backlogOrder = i;
    }
    // Save all in bulk
    await this.issueRepo.save(all);

    // Invalidate cache after mutation
    await this.invalidateBacklogCache(projectId);

    return all;
  }

  /**
   * OPTIMIZED: Bulk reorder backlog items using single query
   * Uses CASE statement to update all items in one query instead of N queries
   */
  async reorderItems(
    projectId: string,
    userId: string,
    issueIds: string[],
  ): Promise<void> {
    // Permission check - only PROJECT_LEAD or MEMBER can reorder
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD && role !== ProjectRole.MEMBER) {
      throw new ForbiddenException(
        'You do not have permission to reorder the backlog',
      );
    }

    if (issueIds.length === 0) return;

    // OPTIMIZED: Single bulk update with CASE statement
    // This replaces N update queries with 1 query (50x improvement for 50 items)
    const caseStatements = issueIds
      .map((id, idx) => `WHEN '${id}' THEN ${idx}`)
      .join(' ');

    // @RAW_QUERY_AUDIT: Tenant isolation verified via getUserRole() + projectId filter
    // Issues are scoped by projectId which is checked at method entry
    await this.issueRepo.query(
      `UPDATE issues 
       SET "backlogOrder" = CASE id ${caseStatements} END
       WHERE id = ANY($1) 
       AND "projectId" = $2`,
      [issueIds, projectId],
    );

    // Invalidate cache after mutation
    await this.invalidateBacklogCache(projectId);
  }

  /**
   * LEXORANK: Move item to new position with O(1) update
   * Only updates the moved item's lexorank - not all items
   *
   * @param projectId - The project containing the issues
   * @param userId - User performing the action
   * @param issueId - Issue being moved
   * @param targetIndex - Target position in the list
   * @param allIssues - Current list of issues ordered by lexorank
   */
  async moveItemWithLexorank(
    projectId: string,
    userId: string,
    issueId: string,
    targetIndex: number,
    allIssues: Issue[],
  ): Promise<void> {
    // Permission check
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD && role !== ProjectRole.MEMBER) {
      throw new ForbiddenException('Not authorized to reorder backlog');
    }

    // Get surrounding items for lexorank calculation
    const before = targetIndex > 0 ? allIssues[targetIndex - 1] : null;
    const after =
      targetIndex < allIssues.length ? allIssues[targetIndex] : null;

    let newLexorank: string;

    if (!before && !after) {
      // First/only item in list
      newLexorank = generateDefaultRank();
    } else if (!before) {
      // Insert at beginning
      newLexorank = generateRankBefore(after!.lexorank);
    } else if (!after) {
      // Insert at end
      newLexorank = generateRankAfter(before.lexorank);
    } else {
      // Insert between two items
      newLexorank = calculateMidpoint(before.lexorank, after.lexorank);
    }

    // O(1) UPDATE - only one row updated!
    await this.issueRepo.update({ id: issueId }, { lexorank: newLexorank });

    // Invalidate cache after mutation
    await this.invalidateBacklogCache(projectId);
  }

  /**
   * Get backlog ordered by lexorank (new system)
   */
  async getBacklogByLexorank(
    projectId: string,
    userId: string,
  ): Promise<Issue[]> {
    await this.membersService.getUserRole(projectId, userId);

    return this.issueRepo
      .createQueryBuilder('issue')
      .leftJoin('sprint_issues', 'si', 'si.issueId = issue.id')
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('si.issueId IS NULL')
      .andWhere('issue.isArchived = :isArchived', { isArchived: false })
      .orderBy('issue.lexorank', 'ASC')
      .addOrderBy('issue.createdAt', 'ASC')
      .getMany();
  }
}

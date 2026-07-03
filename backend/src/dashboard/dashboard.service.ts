import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ISSUE_QUERY_TOKEN, type IIssueQuery, type IssueView } from '../issues';
import { SPRINT_SNAPSHOT_TOKEN, type ISprintSnapshot } from '../sprints';
import { PROJECT_QUERY_TOKEN, type IProjectQuery } from '../projects';
import { IssueStatus } from '../issues/entities/issue.entity';
import {
  NOTIFICATION_INBOX_TOKEN,
  NotificationStatus,
  type INotificationInbox,
  type NotificationView,
} from '../notifications';
import { UsersService } from '../users/users.service';

export interface DashboardData {
  assignedIssues: IssueView[];
  activeSprints: any[];
  unreadNotificationsCount: number;
  recentActivity: any[];
}

@Injectable()
export class DashboardService {
  // Micro-cache configuration: 5-second TTL prevents "refresh storms"
  private static readonly CACHE_TTL_MS = 5000;
  private static readonly CACHE_PREFIX = 'dashboard:my-focus:';

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(ISSUE_QUERY_TOKEN) private readonly issuesService: IIssueQuery,
    @Inject(SPRINT_SNAPSHOT_TOKEN)
    private readonly sprintsService: ISprintSnapshot,
    @Inject(NOTIFICATION_INBOX_TOKEN)
    private readonly notificationsInbox: INotificationInbox,
    @Inject(PROJECT_QUERY_TOKEN)
    private readonly projectsQuery: IProjectQuery,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Get dashboard data with micro-caching (5-second TTL)
   * Flow: Check cache → if HIT return immediately → if MISS query DB → set cache → return
   */
  async getMyFocus(userId: string): Promise<DashboardData> {
    const cacheKey = `${DashboardService.CACHE_PREFIX}${userId}`;

    // Step 1: Check cache first
    const cached = await this.cache.get<DashboardData>(cacheKey);
    if (cached) {
      return cached; // Cache HIT - return immediately (< 1ms)
    }

    // Step 2: Cache MISS - Execute expensive query
    const result = await this.fetchDashboardData(userId);

    // Step 3: Store in cache with 5-second TTL
    await this.cache.set(cacheKey, result, DashboardService.CACHE_TTL_MS);

    return result;
  }

  /**
   * Extracted expensive query logic - contains N+1 pattern over projects
   */
  private async fetchDashboardData(userId: string): Promise<DashboardData> {
    const user = await this.usersService.findOneById(userId);
    const projects = await this.projectsQuery.findForUser(
      userId,
      user?.isSuperAdmin || false,
    );

    // N+1 Query Pattern: Loop through projects to find assigned issues
    // This is the EXPENSIVE part we're caching
    const assignedIssues: IssueView[] = [];
    for (const project of projects) {
      const issues = await this.issuesService.findAll(project.id, userId, {
        assigneeId: userId,
      });
      const activeIssues = issues.filter(
        (i) => i.status !== (IssueStatus.DONE as string) && i.status !== 'Done',
      );
      assignedIssues.push(...activeIssues);
    }

    // Sort by most recently updated
    assignedIssues.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    // TODO: Performance concern - fetches ALL sprints, filters client-side
    // Consider adding findActiveSprintsForProjects() method for efficiency
    const activeSprints = await this.sprintsService.findAllActiveSystemWide();
    const myActiveSprints = activeSprints.filter((s) =>
      projects.some((p) => p.id === s.projectId),
    );

    const notifications: NotificationView[] =
      await this.notificationsInbox.listForUser(
        userId,
        NotificationStatus.UNREAD,
      );

    const recentActivity = notifications.slice(0, 5).map((n) => ({
      id: n.id,
      message: n.message,
      createdAt: n.createdAt,
      type: n.type,
      context: n.context as Record<string, any>,
    }));

    return {
      assignedIssues: assignedIssues.slice(0, 20),
      activeSprints: myActiveSprints,
      unreadNotificationsCount: notifications.length,
      recentActivity,
    };
  }

  /**
   * Invalidate cache for a specific user
   * Call this when issues are assigned/updated for real-time consistency
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const cacheKey = `${DashboardService.CACHE_PREFIX}${userId}`;
    await this.cache.del(cacheKey);
  }
}

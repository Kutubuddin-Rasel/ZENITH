import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { IssuesService } from '../issues/issues.service';
import { SprintsService } from '../sprints/sprints.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectsService } from '../projects/projects.service';
import { Issue, IssueStatus } from '../issues/entities/issue.entity';
import {
  Notification,
  NotificationStatus,
} from '../notifications/entities/notification.entity';
import { UsersService } from '../users/users.service';

export interface DashboardData {
  assignedIssues: Issue[];
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
    private readonly issuesService: IssuesService,
    private readonly sprintsService: SprintsService,
    private readonly notificationsService: NotificationsService,
    private readonly projectsService: ProjectsService,
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
    const projects = await this.projectsService.findAllForUser(
      userId,
      user?.isSuperAdmin || false,
    );

    // N+1 Query Pattern: Loop through projects to find assigned issues
    // This is the EXPENSIVE part we're caching
    const assignedIssues: Issue[] = [];
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

    const activeSprints = await this.sprintsService.findAllActiveSystemWide();
    const myActiveSprints = activeSprints.filter((s) =>
      projects.some((p) => p.id === s.projectId),
    );

    const notifications: Notification[] =
      await this.notificationsService.listForUser(
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

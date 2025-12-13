import { Injectable } from '@nestjs/common';
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
  activeSprints: any[]; // Type properly if possible
  unreadNotificationsCount: number;
  recentActivity: any[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly issuesService: IssuesService,
    private readonly sprintsService: SprintsService,
    private readonly notificationsService: NotificationsService,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
  ) {}

  async getMyFocus(userId: string): Promise<DashboardData> {
    const user = await this.usersService.findOneById(userId);
    // 1. Get assigned issues that are NOT Done (My Work)
    // We need to fetch from all projects the user is part of.
    // Since IssuesService.findAll requires a projectId, we first find user's projects.
    const projects = await this.projectsService.findAllForUser(
      userId,
      user?.isSuperAdmin || false,
    );

    // In a real production app, we would have a dedicated query for "assigned to me across all projects"
    // For now, we'll iterate active projects. Limiting to recent/active projects is a good optimization.
    const assignedIssues: Issue[] = [];
    for (const project of projects) {
      const issues = await this.issuesService.findAll(project.id, userId, {
        assigneeId: userId,
      });
      // Filter out Done/Archived
      const activeIssues = issues.filter(
        (i) => i.status !== (IssueStatus.DONE as string) && i.status !== 'Done', // Safety check for string status
      );
      assignedIssues.push(...activeIssues);
    }

    // Sort by priority/date client-side or here. Let's do a basic sort here.
    assignedIssues.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    // 2. Get Active Sprints
    const activeSprints = await this.sprintsService.findAllActiveSystemWide();
    const myActiveSprints = activeSprints.filter((s) =>
      projects.some((p) => p.id === s.projectId),
    );

    // 3. Unread Notifications Count
    const notifications: Notification[] =
      await this.notificationsService.listForUser(
        userId,
        NotificationStatus.UNREAD,
      );

    // 4. Recent Activity (Mentions/Notifications) - Limit 5
    const recentActivity = notifications.slice(0, 5).map((n) => ({
      id: n.id,
      message: n.message,
      createdAt: n.createdAt,
      type: n.type,
      context: n.context as Record<string, any>,
    }));

    return {
      assignedIssues: assignedIssues.slice(0, 20), // Limit payload
      activeSprints: myActiveSprints,
      unreadNotificationsCount: notifications.length,
      recentActivity,
    };
  }
}

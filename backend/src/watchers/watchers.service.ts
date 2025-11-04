// src/watchers/watchers.service.ts
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Watcher } from './entities/watcher.entity';
import { ProjectsService } from '../projects/projects.service';
import { IssuesService } from '../issues/issues.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { NotificationsEmitter } from './events/notifications.events';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
@Injectable()
export class WatchersService {
  constructor(
    @InjectRepository(Watcher)
    private watcherRepo: Repository<Watcher>,
    private projectsService: ProjectsService,
    @Inject(forwardRef(() => IssuesService))
    private issuesService: IssuesService,
    private membersService: ProjectMembersService,
    private notifications: NotificationsEmitter,
    private notificationsService: NotificationsService,
  ) {}

  /** Toggle project watcher: if exists remove, else add */
  async toggleProjectWatcher(
    projectId: string,
    userId: string,
  ): Promise<{ watching: boolean }> {
    // ensure membership
    await this.membersService.getUserRole(projectId, userId);
    // find existing
    const existing = await this.watcherRepo.findOneBy({ projectId, userId });
    if (existing) {
      await this.watcherRepo.remove(existing);
      return { watching: false };
    }
    // create new
    await this.projectsService.findOneById(projectId);
    const w = this.watcherRepo.create({ projectId, userId });
    await this.watcherRepo.save(w);
    return { watching: true };
  }

  /** List watchers for project */
  async listProjectWatchers(
    projectId: string,
    userId: string,
  ): Promise<string[]> {
    // only project members can view
    await this.membersService.getUserRole(projectId, userId);
    const watchers = await this.watcherRepo.find({
      where: { projectId },
      select: ['userId'],
    });
    return watchers.map((w) => w.userId);
  }

  /** Toggle issue watcher */
  async toggleIssueWatcher(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<{ watching: boolean }> {
    // ensure membership & issue exists
    await this.issuesService.findOne(projectId, issueId, userId);
    const existing = await this.watcherRepo.findOneBy({ issueId, userId });
    if (existing) {
      await this.watcherRepo.remove(existing);
      return { watching: false };
    }
    const w = this.watcherRepo.create({ issueId, userId });
    await this.watcherRepo.save(w);
    return { watching: true };
  }

  /** List watchers for issue */
  async listIssueWatchers(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<string[]> {
    await this.issuesService.findOne(projectId, issueId, userId);
    const watchers = await this.watcherRepo.find({
      where: { issueId },
      select: ['userId'],
    });
    return watchers.map((w) => w.userId);
  }

  /** Emit notification to watchers (to be called by other services) */
  notifyWatchersOnEvent(
    projectId: string,
    issueId: string | null,
    action: string, // e.g. 'commented', 'changed status to X'
    actorId: string, // user who performed action
  ) {
    await Promise.all([
      // all watchers on the project
      this.watcherRepo.find({ where: { projectId }, select: ['userId'] }),
      // plus watchers on the issue (if any)
      issueId
        ? this.watcherRepo.find({ where: { issueId }, select: ['userId'] })
        : Promise.resolve([]),
    ]).then(async ([projWatchers, issueWatchers]) => {
      // build unique set of userIds, excluding the actor
      const ids = new Set<string>();
      projWatchers.forEach((w) => ids.add(w.userId));
      issueWatchers.forEach((w) => ids.add(w.userId));
      ids.delete(actorId);

      const userIds = Array.from(ids);
      if (userIds.length === 0) {
        return;
      }

      // build the message and context
      const message =
        `User ${actorId} ${action}` + (issueId ? ` on issue ${issueId}` : '');
      const context = { projectId, ...(issueId && { issueId }) };

      // 1) Emit live in‑app event
      this.notifications.emitNotification({
        userIds,
        message,
        context,
      });

      // 2) Persist notifications to the DB
      await this.notificationsService.createMany(
        userIds,
        message,
        context,
        NotificationType.INFO, // or pick a type based on action
      );
    });
  }
}

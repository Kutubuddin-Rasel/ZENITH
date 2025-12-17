// src/watchers/watchers.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Watcher } from './entities/watcher.entity';
// REFACTORED: Using direct repositories instead of services
import { Project } from '../projects/entities/project.entity';
import { Issue } from '../issues/entities/issue.entity';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { NotificationsEmitter } from './events/notifications.events';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class WatchersService {
  constructor(
    @InjectRepository(Watcher)
    private watcherRepo: Repository<Watcher>,
    // REFACTORED: Direct repository injection instead of ProjectsService
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    // REFACTORED: Direct repository injection instead of IssuesService
    @InjectRepository(Issue)
    private issueRepo: Repository<Issue>,
    private membersService: ProjectMembersService,
    private notifications: NotificationsEmitter,
    // REFACTORED: Using EventEmitter2 instead of NotificationsService
    private eventEmitter: EventEmitter2,
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
    // REFACTORED: Direct repo query instead of projectsService.findOneById
    const project = await this.projectRepo.findOneBy({ id: projectId });
    if (!project) throw new Error('Project not found');
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
    // REFACTORED: Direct repo query instead of issuesService.findOne
    const issue = await this.issueRepo.findOne({
      where: { id: issueId, projectId },
    });
    if (!issue) throw new Error('Issue not found');
    await this.membersService.getUserRole(projectId, userId);

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
    // REFACTORED: Direct repo query instead of issuesService.findOne
    const issue = await this.issueRepo.findOne({
      where: { id: issueId, projectId },
    });
    if (!issue) throw new Error('Issue not found');
    await this.membersService.getUserRole(projectId, userId);

    const watchers = await this.watcherRepo.find({
      where: { issueId },
      select: ['userId'],
    });
    return watchers.map((w) => w.userId);
  }

  /** Emit notification to watchers (to be called by other services) */
  async notifyWatchersOnEvent(
    projectId: string,
    issueId: string | null,
    action: string,
    actorId: string,
  ) {
    await Promise.all([
      this.watcherRepo.find({ where: { projectId }, select: ['userId'] }),
      issueId
        ? this.watcherRepo.find({ where: { issueId }, select: ['userId'] })
        : Promise.resolve([]),
    ]).then(([projWatchers, issueWatchers]) => {
      const ids = new Set<string>();
      projWatchers.forEach((w) => ids.add(w.userId));
      issueWatchers.forEach((w) => ids.add(w.userId));
      ids.delete(actorId);

      const userIds = Array.from(ids);
      if (userIds.length === 0) return;

      const message =
        `User ${actorId} ${action}` + (issueId ? ` on issue ${issueId}` : '');
      const context = { projectId, ...(issueId && { issueId }) };

      // 1) Emit live in-app event
      this.notifications.emitNotification({
        userIds,
        message,
        context,
      });

      // 2) REFACTORED: Emit event for NotificationsModule to handle persistence
      this.eventEmitter.emit('watcher.notification', {
        userIds,
        message,
        context,
        type: 'INFO',
      });
    });
  }
}

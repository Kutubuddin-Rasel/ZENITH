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
import { BatchWatchFailure, BatchWatchResult } from './dto/batch-watch.dto';
import { WatchPreference } from './enums/watch-preference.enum';

/**
 * Strictly-typed metadata accompanying a watcher dispatch. Used by the
 * filtering pipeline to honor each watcher's WatchPreference.
 */
export interface WatcherEventMeta {
  /** True when the underlying event represents a status transition. */
  isStatusChange?: boolean;
  /** Subset of recipient userIds explicitly @-mentioned in the source event. */
  mentionedUserIds?: string[];
}

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
    preference: WatchPreference = WatchPreference.ALL,
  ): Promise<{ watching: boolean; preference?: WatchPreference }> {
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
    const w = this.watcherRepo.create({ projectId, userId, preference });
    await this.watcherRepo.save(w);
    return { watching: true, preference };
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
    preference: WatchPreference = WatchPreference.ALL,
  ): Promise<{ watching: boolean; preference?: WatchPreference }> {
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
    const w = this.watcherRepo.create({ issueId, userId, preference });
    await this.watcherRepo.save(w);
    return { watching: true, preference };
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

  /**
   * Batch-toggle issue watchers for the caller within a single project.
   * Each issue is processed independently; a failure on one entry does not
   * abort the batch. Returns aggregate counts plus the per-issue failure list.
   */
  async batchToggleIssueWatchers(
    projectId: string,
    userId: string,
    issueIds: string[],
    preference: WatchPreference = WatchPreference.ALL,
  ): Promise<BatchWatchResult> {
    // Membership check once for the whole batch (fail-fast if not a member).
    await this.membersService.getUserRole(projectId, userId);

    const failures: BatchWatchFailure[] = [];
    let success = 0;

    // De-duplicate to avoid double-toggling the same issue within one request.
    const uniqueIds = Array.from(new Set(issueIds));

    for (const issueId of uniqueIds) {
      try {
        const issue = await this.issueRepo.findOne({
          where: { id: issueId, projectId },
        });
        if (!issue) {
          failures.push({ issueId, reason: 'Issue not found' });
          continue;
        }

        const existing = await this.watcherRepo.findOneBy({ issueId, userId });
        if (existing) {
          await this.watcherRepo.remove(existing);
        } else {
          await this.watcherRepo.save(
            this.watcherRepo.create({ issueId, userId, preference }),
          );
        }
        success += 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        failures.push({ issueId, reason });
      }
    }

    return { success, failed: failures.length, failures };
  }

  /**
   * Apply a watcher's WatchPreference against the event metadata.
   * Returns true when the notification should be delivered.
   */
  private shouldDeliver(
    preference: WatchPreference,
    userId: string,
    meta: WatcherEventMeta,
  ): boolean {
    switch (preference) {
      case WatchPreference.ALL:
        return true;
      case WatchPreference.MENTIONS_ONLY:
        return meta.mentionedUserIds?.includes(userId) === true;
      case WatchPreference.STATUS_CHANGES:
        return meta.isStatusChange === true;
    }
  }

  /**
   * Resolve the effective preference for a user with potentially overlapping
   * project + issue subscriptions. The most permissive level wins
   * (ALL > MENTIONS_ONLY > STATUS_CHANGES) so the user receives every event
   * any of their subscriptions would individually permit.
   */
  private resolveEffectivePreference(
    preferences: WatchPreference[],
  ): WatchPreference {
    if (preferences.includes(WatchPreference.ALL)) return WatchPreference.ALL;
    if (preferences.includes(WatchPreference.MENTIONS_ONLY)) {
      return WatchPreference.MENTIONS_ONLY;
    }
    return WatchPreference.STATUS_CHANGES;
  }

  /** Emit notification to watchers (to be called by other services) */
  async notifyWatchersOnEvent(
    projectId: string,
    issueId: string | null,
    action: string,
    actorId: string,
    meta: WatcherEventMeta = {},
  ): Promise<void> {
    const [projWatchers, issueWatchers] = await Promise.all([
      this.watcherRepo.find({
        where: { projectId },
        select: ['userId', 'preference'],
      }),
      issueId
        ? this.watcherRepo.find({
            where: { issueId },
            select: ['userId', 'preference'],
          })
        : Promise.resolve([]),
    ]);

    // Aggregate every preference observed per user across both subscriptions.
    const prefsByUser = new Map<string, WatchPreference[]>();
    const collect = (rows: Watcher[]): void => {
      for (const w of rows) {
        if (w.userId === actorId) continue;
        const list = prefsByUser.get(w.userId);
        if (list) list.push(w.preference);
        else prefsByUser.set(w.userId, [w.preference]);
      }
    };
    collect(projWatchers);
    collect(issueWatchers);

    if (prefsByUser.size === 0) return;

    // Filtering pipeline: honor each watcher's effective preference.
    const recipients: string[] = [];
    for (const [userId, prefs] of prefsByUser) {
      const effective = this.resolveEffectivePreference(prefs);
      if (this.shouldDeliver(effective, userId, meta)) {
        recipients.push(userId);
      }
    }

    if (recipients.length === 0) return;

    const message =
      `User ${actorId} ${action}` + (issueId ? ` on issue ${issueId}` : '');
    const context = { projectId, ...(issueId && { issueId }) };

    // 1) Emit live in-app event
    this.notifications.emitNotification({
      userIds: recipients,
      message,
      context,
    });

    // 2) REFACTORED: Emit event for NotificationsModule to handle persistence
    this.eventEmitter.emit('watcher.notification', {
      userIds: recipients,
      message,
      context,
      type: 'INFO',
    });
  }
}

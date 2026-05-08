import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { GamificationService } from '../gamification.service';

@Injectable()
export class GamificationListener {
  private readonly logger = new Logger(GamificationListener.name);

  constructor(private readonly gamificationService: GamificationService) {}

  // ── Sprint Completion ────────────────────────────────────────────

  @OnEvent('sprint.event')
  async handleSprintEvent(payload: {
    projectId: string;
    action: string;
    actorId: string;
    sprintName: string;
  }) {
    // Check if the event is a sprint completion (archive)
    // SprintsService emits: "archived sprint {name}"
    if (payload.action.startsWith('archived sprint')) {
      this.logger.log(`Detected sprint completion by user ${payload.actorId}`);

      // Unlock "First Sprint" achievement
      await this.gamificationService.unlockAchievement(
        payload.actorId,
        'first-sprint',
      );
    }
  }

  // ── Issue Created ────────────────────────────────────────────────

  @OnEvent('issue.created')
  async handleIssueCreated(payload: {
    issueId: string;
    projectId: string;
    actorId: string;
  }) {
    this.logger.log(`Issue created by user ${payload.actorId}`);

    // One-shot: First Issue
    await this.gamificationService.unlockAchievement(
      payload.actorId,
      'first-issue',
    );

    // Multi-step: Prolific Creator (25 issues)
    await this.gamificationService.incrementProgress(
      payload.actorId,
      'prolific-creator',
      1,
      25,
    );
  }

  // ── Bug Resolved ─────────────────────────────────────────────────

  @OnEvent('issue.statusChanged')
  async handleBugResolved(payload: {
    issueId: string;
    projectId: string;
    actorId: string;
    previousStatus: string;
    newStatus: string;
    labels?: string[];
  }) {
    // Only trigger for issues resolved (moved to done/closed) that carry a bug label
    const resolvedStatuses = ['done', 'closed', 'resolved'];
    const isBugLabel = payload.labels?.some((l) =>
      l.toLowerCase().includes('bug'),
    );

    if (
      resolvedStatuses.includes(payload.newStatus.toLowerCase()) &&
      isBugLabel
    ) {
      this.logger.log(`Bug resolved by user ${payload.actorId}`);

      // One-shot: Bug Hunter (resolve 1 bug)
      await this.gamificationService.unlockAchievement(
        payload.actorId,
        'bug-hunter',
      );

      // Multi-step: Bug Hunter X (resolve 10 bugs)
      await this.gamificationService.incrementProgress(
        payload.actorId,
        'bug-hunter-x',
        1,
        10,
      );
    }
  }

  // ── Early Bird (Task completed before due date) ──────────────────

  @OnEvent('issue.completed')
  async handleEarlyBird(payload: {
    issueId: string;
    projectId: string;
    actorId: string;
    completedAt: string | Date;
    dueDate?: string | Date;
  }) {
    if (!payload.dueDate) return;

    const completed = new Date(payload.completedAt);
    const due = new Date(payload.dueDate);

    if (completed < due) {
      this.logger.log(`Early bird completion by user ${payload.actorId}`);
      await this.gamificationService.unlockAchievement(
        payload.actorId,
        'early-bird',
      );
    }
  }

  // ── Collaborator (First comment on an issue) ─────────────────────

  @OnEvent('comment.created')
  async handleCommentCreated(payload: {
    commentId: string;
    issueId: string;
    projectId: string;
    actorId: string;
  }) {
    this.logger.log(`Comment created by user ${payload.actorId}`);
    await this.gamificationService.unlockAchievement(
      payload.actorId,
      'collaborator',
    );
  }

  // ── Team Player (Joined a project) ───────────────────────────────

  @OnEvent('member.added')
  async handleMemberAdded(payload: {
    projectId: string;
    userId: string;
    role: string;
    addedBy?: string;
  }) {
    this.logger.log(
      `User ${payload.userId} joined project ${payload.projectId}`,
    );
    await this.gamificationService.unlockAchievement(
      payload.userId,
      'team-player',
    );
  }
}

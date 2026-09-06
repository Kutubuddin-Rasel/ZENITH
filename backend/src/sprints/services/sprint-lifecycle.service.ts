import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { Sprint, SprintStatus } from '../entities/sprint.entity';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
  ISSUE_TRANSITION_TOKEN,
  IssueStatus,
  type IIssueTransition,
} from '../../issues';
import { SmartDefaultsService } from '../../user-preferences/services/smart-defaults.service';
import { SPRINT_EVENT_FACTORY_TOKEN } from '../../common/constants/events.tokens';
import type { ISprintEventFactory } from '../../common/interfaces/event-factory.interfaces';
import { CACHE_INVALIDATOR_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheInvalidator } from '../../cache/interfaces/cache.interfaces';
import type {
  ISprintLifecycle,
  SprintView,
} from '../interfaces/sprints.interfaces';

/**
 * SprintLifecycleService — sprint completion ("archive") with issue
 * rollover (`SPRINT_LIFECYCLE_TOKEN`).
 *
 * Step 3 correctness fixes (Directive A — EntityManager Passthrough):
 *  - The rollover + status flip now run inside ONE
 *    `dataSource.transaction`, replacing the legacy non-atomic sequence
 *    (bulk move/remove → save COMPLETED → side effects) that corrupted
 *    state on a mid-sequence failure.
 *  - Rollover-to-backlog routes the `Issue.status` reset through
 *    `ISSUE_TRANSITION_TOKEN.updateStatus(..., manager)` on the sprint's
 *    own manager — the issue domain keeps ownership of its status/audit/
 *    events, executed inside this transaction. This also fixes the
 *    LATENT BUG where backlog rollover dropped the join row but left the
 *    underlying `Issue.status` untouched.
 *  - Side effects (event, behaviour learning, cache invalidation) fire
 *    ONLY after the transaction commits — a rollback never leaks them.
 */
@Injectable()
export class SprintLifecycleService implements ISprintLifecycle {
  constructor(
    private readonly sprintRepo: AbstractSprintRepository,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly members: IProjectMemberQuery,
    private readonly dataSource: DataSource,
    @Inject(ISSUE_TRANSITION_TOKEN)
    private readonly issueTransition: IIssueTransition,
    private readonly eventEmitter: EventEmitter2,
    @Inject(SPRINT_EVENT_FACTORY_TOKEN)
    private readonly sprintEventFactory: ISprintEventFactory,
    private readonly smartDefaultsService: SmartDefaultsService,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly cacheInvalidator: ICacheInvalidator,
  ) {}

  async archive(
    projectId: string,
    sprintId: string,
    userId: string,
    nextSprintId?: string,
  ): Promise<SprintView> {
    const sprint = await this.resolveForLead(projectId, sprintId, userId);

    const sprintIssues =
      await this.sprintRepo.findSprintIssuesWithIssue(sprintId);
    const incompleteSprintIssues = sprintIssues.filter(
      (si) => si.issue.status !== (IssueStatus.DONE as string),
    );

    const rolloverToNext =
      incompleteSprintIssues.length > 0 &&
      !!nextSprintId &&
      nextSprintId !== sprintId;

    // Validate the rollover target BEFORE opening the transaction so an
    // invalid target never starts (and never partially commits) a write.
    if (rolloverToNext) {
      const nextSprint = await this.sprintRepo.findActiveInProject(
        projectId,
        nextSprintId,
      );
      if (!nextSprint) {
        throw new BadRequestException('Next sprint not found or not active');
      }
    }

    // ATOMIC: rollover + status flip in a single physical transaction.
    const archived = await this.dataSource.transaction(async (manager) => {
      if (incompleteSprintIssues.length > 0) {
        if (rolloverToNext) {
          const incompleteIssueIds = incompleteSprintIssues.map((si) => si.id);
          await this.sprintRepo.moveIssuesToSprint(
            incompleteIssueIds,
            nextSprintId,
            manager,
          );
        } else {
          // Move to backlog: drop the join rows AND reset each issue's
          // status via the issue domain on this manager (latent-bug fix).
          await this.sprintRepo.removeSprintIssues(
            incompleteSprintIssues,
            manager,
          );
          for (const si of incompleteSprintIssues) {
            await this.issueTransition.updateStatus(
              projectId,
              si.issueId,
              IssueStatus.BACKLOG,
              userId,
              manager,
            );
          }
        }
      }

      sprint.isActive = false;
      sprint.status = SprintStatus.COMPLETED;
      return this.sprintRepo.save(sprint, manager);
    });

    // AFTER-COMMIT side effects only.
    const archivePayload = this.sprintEventFactory.create({
      projectId,
      sprintId: archived.id,
      actorId: userId,
      action: `archived sprint ${archived.name}`,
      sprintName: archived.name,
    });
    this.eventEmitter.emit('sprint.event', archivePayload);

    const completedIssuesCount =
      sprintIssues.length - incompleteSprintIssues.length;
    const completionRate =
      sprintIssues.length > 0 ? completedIssuesCount / sprintIssues.length : 0;

    await this.smartDefaultsService.learnFromBehavior(userId, {
      action: 'sprint_completed',
      context: {
        projectId,
        sprintId,
        issuesCount: sprintIssues.length,
        completedCount: completedIssuesCount,
        completionRate,
        velocity: completedIssuesCount,
      },
      timestamp: new Date(),
    });

    try {
      await this.cacheInvalidator.invalidateByTags([
        `sprint:${sprintId}`,
        `project:${projectId}`,
      ]);
    } catch {
      // Fire and forget — never fail archive for a cache issue.
    }

    return archived;
  }

  private async resolveForLead(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<Sprint> {
    const sprint = await this.sprintRepo.findDetailById(projectId, sprintId);
    if (!sprint) throw new NotFoundException('Sprint not found');

    const role = await this.members.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can archive sprint');
    }
    return sprint;
  }
}

import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { Sprint } from '../entities/sprint.entity';
import { AddIssueToSprintDto } from '../dto/add-issue.dto';
import { RemoveIssueFromSprintDto } from '../dto/remove-issue.dto';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
  ISSUE_QUERY_TOKEN,
  ISSUE_TRANSITION_TOKEN,
  IssueStatus,
  type IIssueQuery,
  type IIssueTransition,
} from '../../issues';
import { SPRINT_EVENT_FACTORY_TOKEN } from '../../common/constants/events.tokens';
import type { ISprintEventFactory } from '../../common/interfaces/event-factory.interfaces';
import type {
  ISprintMembership,
  SprintIssueView,
} from '../interfaces/sprints.interfaces';

const BACKLOG_STATUSES = ['Backlog', 'backlog'];

/**
 * SprintMembershipService — add/remove issues to/from a sprint
 * (`SPRINT_MEMBERSHIP_TOKEN`).
 *
 * Step 3 (Directive A — EntityManager Passthrough): the join-row write
 * and the foreign `Issue.status` sync run inside ONE
 * `dataSource.transaction`. The status mutation is routed through
 * `ISSUE_TRANSITION_TOKEN.updateStatus(..., manager)` on the sprint's
 * own manager — NO `manager.update(Issue, …)` here — so the issue
 * domain owns its status/audit/events while committing atomically with
 * the membership change. The domain event fires only after commit.
 */
@Injectable()
export class SprintMembershipService implements ISprintMembership {
  constructor(
    private readonly sprintRepo: AbstractSprintRepository,
    private readonly dataSource: DataSource,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly members: IProjectMemberQuery,
    @Inject(ISSUE_QUERY_TOKEN)
    private readonly issuesService: IIssueQuery,
    @Inject(ISSUE_TRANSITION_TOKEN)
    private readonly issueTransition: IIssueTransition,
    private readonly eventEmitter: EventEmitter2,
    @Inject(SPRINT_EVENT_FACTORY_TOKEN)
    private readonly sprintEventFactory: ISprintEventFactory,
  ) {}

  async addIssue(
    projectId: string,
    sprintId: string,
    userId: string,
    dto: AddIssueToSprintDto,
  ): Promise<SprintIssueView> {
    const sprint = await this.resolveForMember(
      projectId,
      sprintId,
      userId,
      'add issues',
    );
    const issue = await this.issuesService.findOne(
      projectId,
      dto.issueId,
      userId,
    );

    const saved = await this.dataSource.transaction(async (manager) => {
      const savedRelation = await this.sprintRepo.createSprintIssue(
        {
          sprintId,
          issueId: dto.issueId,
          sprintOrder: dto.sprintOrder ?? 0,
        },
        manager,
      );

      // Pull the issue out of the backlog as part of the same tx, via
      // the issue domain (state-machine + audit + events stay there).
      if (BACKLOG_STATUSES.includes(issue.status)) {
        await this.issueTransition.updateStatus(
          projectId,
          dto.issueId,
          IssueStatus.TODO,
          userId,
          manager,
        );
      }

      return savedRelation;
    });

    this.emit(
      projectId,
      sprint,
      userId,
      `added issue to sprint ${sprint.name}`,
      dto.issueId,
    );
    return saved;
  }

  async removeIssue(
    projectId: string,
    sprintId: string,
    userId: string,
    dto: RemoveIssueFromSprintDto,
  ): Promise<void> {
    const sprint = await this.resolveForMember(
      projectId,
      sprintId,
      userId,
      'remove issues',
    );
    const si = await this.sprintRepo.findSprintIssue(sprintId, dto.issueId);
    if (!si) throw new NotFoundException('Issue not in sprint');

    await this.dataSource.transaction(async (manager) => {
      await this.sprintRepo.removeSprintIssue(si, manager);
      await this.issueTransition.updateStatus(
        projectId,
        dto.issueId,
        IssueStatus.BACKLOG,
        userId,
        manager,
      );
    });

    this.emit(
      projectId,
      sprint,
      userId,
      `removed issue from sprint ${sprint.name}`,
      dto.issueId,
    );
  }

  /** Load a sprint and assert the caller is a lead or member. */
  private async resolveForMember(
    projectId: string,
    sprintId: string,
    userId: string,
    action: string,
  ): Promise<Sprint> {
    const sprint = await this.sprintRepo.findDetailById(projectId, sprintId);
    if (!sprint) throw new NotFoundException('Sprint not found');

    const role = await this.members.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD && role !== ProjectRole.MEMBER) {
      throw new ForbiddenException(`Insufficient permissions to ${action}`);
    }
    return sprint;
  }

  private emit(
    projectId: string,
    sprint: Sprint,
    actorId: string,
    action: string,
    issueId: string,
  ): void {
    const payload = this.sprintEventFactory.create({
      projectId,
      sprintId: sprint.id,
      actorId,
      action,
      sprintName: sprint.name,
      issueId,
    });
    this.eventEmitter.emit('sprint.event', payload);
  }
}

import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { IssueRepository } from '../../database/repositories/issue.repository';
import { Issue } from '../entities/issue.entity';
import type { IIssueAssignment } from '../interfaces/issues.interfaces';
import { IssueQueryService } from './issue-query.service';

/**
 * IssueAssignmentService — membership-validated assignee surface.
 *
 * Bound to `ISSUE_ASSIGNMENT_TOKEN`. This is the Step-3 realization of
 * `IIssueAssignment`: the legacy god class folded assignment inside
 * `create()` / `update()` and never satisfied this contract. The
 * extracted logic mirrors the god class's reassign/unassign branches
 * (membership check + `issue.updated` event with the same action
 * strings). No external consumer injects this token until Step 4.
 */
@Injectable()
export class IssueAssignmentService implements IIssueAssignment {
  constructor(
    private readonly query: IssueQueryService,
    private readonly issueRepo: IssueRepository,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly projectMembersService: IProjectMemberQuery,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Throw unless `assigneeId` is an active member of the project. */
  async validateAssignee(projectId: string, assigneeId: string): Promise<void> {
    const role = await this.projectMembersService.getUserRole(
      projectId,
      assigneeId,
    );
    if (!role) {
      throw new BadRequestException('Assignee is not a project member');
    }
  }

  /** Set the assignee (validates membership), emit assignment event. */
  async setAssignee(
    projectId: string,
    issueId: string,
    assigneeId: string,
    userId: string,
  ): Promise<Issue> {
    await this.validateAssignee(projectId, assigneeId);
    const issue = await this.query.findOne(projectId, issueId, userId);

    issue.assigneeId = assigneeId;
    const saved = await this.issueRepo.save(issue);

    this.eventEmitter.emit('issue.updated', {
      projectId,
      issueId: issue.id,
      actorId: userId,
      action: `reassigned issue to ${assigneeId} `,
    });

    return saved;
  }

  /** Clear the assignee, emit unassignment event. */
  async clearAssignee(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<Issue> {
    const issue = await this.query.findOne(projectId, issueId, userId);

    issue.assigneeId = null;
    const saved = await this.issueRepo.save(issue);

    this.eventEmitter.emit('issue.updated', {
      projectId,
      issueId: issue.id,
      actorId: userId,
      action: 'unassigned issue',
    });

    return saved;
  }
}

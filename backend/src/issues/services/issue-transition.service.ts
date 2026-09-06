import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Issue } from '../entities/issue.entity';
import { MoveIssueDto } from '../dto/move-issue.dto';
import type { IIssueTransition } from '../interfaces/issues.interfaces';
import { AuditPort } from '../ports/audit.port';
import { IssueBroadcastPort } from '../ports/issue-broadcast.port';
import {
  WorkflowStatusLookupPort,
  WorkflowTransitionPolicyPort,
} from '../ports/workflow-lookup.port';
import { IssueQueryService } from './issue-query.service';
import { toBroadcastSlim } from '../mappers/issue.mapper';

/**
 * IssueTransitionService — the ACID home for status-machine changes.
 *
 * Bound to `ISSUE_TRANSITION_TOKEN`. Owns `updateStatus` + `moveIssue`.
 *
 * Step 3 transaction-correctness fixes (vs. the legacy god class):
 *  - `updateStatus` now writes the status INSIDE `dataSource.transaction`
 *    and emits its domain event + board broadcast ONLY AFTER the commit
 *    resolves — the god class emitted `issue.updated` BEFORE the save
 *    completed (event-before-commit hazard) and never wrapped the write.
 *  - `moveIssue` stamps the REAL `tenant_id` on its audit record instead
 *    of the placeholder `'unknown'`, resolved from the issue's loaded
 *    `project` relation.
 *
 * In both methods the transaction callback contains ONLY the persistence
 * write; event emission, broadcast, audit and cache invalidation are
 * after-commit side effects so a rollback never leaks an event.
 */
@Injectable()
export class IssueTransitionService implements IIssueTransition {
  constructor(
    private readonly query: IssueQueryService,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly projectMembersService: IProjectMemberQuery,
    private readonly transitionPolicy: WorkflowTransitionPolicyPort,
    private readonly statusLookup: WorkflowStatusLookupPort,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly issueBroadcast: IssueBroadcastPort,
    private readonly auditPort: AuditPort,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
  ) {}

  /**
   * Update issue status (Linear-style: status == column name). Validates
   * workflow transition rules, then writes + dispatches atomically.
   */
  async updateStatus(
    projectId: string,
    issueId: string,
    status: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<Issue> {
    const issue = await this.query.findOne(projectId, issueId, userId);
    const userRole = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );

    // State Machine Enforcement (outside the tx — pure validation).
    const transitionCheck = await this.transitionPolicy.isTransitionAllowed(
      projectId,
      issue.status,
      status,
      userRole || '',
      issue,
    );
    if (!transitionCheck.allowed) {
      throw new ForbiddenException(
        transitionCheck.reason || 'This status transition is not allowed',
      );
    }

    const oldStatus = issue.status;

    // ACID: status write inside a transaction; NO side effects here.
    // EntityManager Passthrough — when a caller supplies its own
    // `manager` the write JOINS that transaction (so a sprint
    // add/remove/rollover commits issue + join atomically); otherwise we
    // open our own. The persist closure is identical either way.
    const persist = (m: EntityManager): Promise<Issue> => {
      issue.status = status;
      return m.save(issue);
    };
    const saved = manager
      ? await persist(manager)
      : await this.dataSource.transaction(persist);

    // AFTER-COMMIT dispatch — the event can no longer precede the write.
    this.eventEmitter.emit('issue.updated', {
      projectId,
      issueId: issue.id,
      actorId: userId,
      action: `changed status to ${status} `,
      transitionName: transitionCheck.transitionName,
    });

    void this.issueBroadcast.broadcastToProjectBoards(
      projectId,
      'issue.moved',
      {
        issueId: issue.id,
        oldColumnId: oldStatus,
        newColumnId: status,
        newIndex: issue.backlogOrder,
        updatedIssueSlim: toBroadcastSlim(saved),
      },
    );

    return saved;
  }

  /**
   * Unified drag-and-drop move: status (column) change + position update,
   * applied atomically. Audit/event/broadcast are after-commit effects.
   */
  async moveIssue(
    projectId: string,
    issueId: string,
    userId: string,
    dto: MoveIssueDto,
  ): Promise<Issue> {
    const issue = await this.query.findOne(projectId, issueId, userId);

    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== issue.version
    ) {
      throw new ConflictException({
        message:
          'This issue was modified by another user. Please refresh and try again.',
        currentVersion: issue.version,
        yourVersion: dto.expectedVersion,
      });
    }

    // Resolve+validate the target status inside the tx so an invalid
    // target rolls the write back (DataSource-driven; abstract repo
    // exposes no manager surface — DIP).
    const result = await this.dataSource.transaction(async (manager) => {
      if (dto.targetStatusId) {
        const newStatus = await this.statusLookup.findById(dto.targetStatusId);
        if (!newStatus) {
          throw new BadRequestException('Invalid target status');
        }
        if (newStatus.projectId !== projectId) {
          throw new BadRequestException(
            'Status does not belong to this project',
          );
        }
        issue.statusId = dto.targetStatusId;
        issue.status = newStatus.name;
      }

      if (dto.targetPosition !== undefined) {
        issue.backlogOrder = dto.targetPosition;
      }

      return manager.save(issue);
    });

    // NOTE: legacy verbatim — deletes the un-spaced key, which does not
    // match the spaced `issue:${id} ` write key (pre-existing no-op).
    await this.cacheStore.del(`issue:${issueId}`);

    this.eventEmitter.emit('issue.moved', {
      projectId,
      issueId: result.id,
      actorId: userId,
      targetStatusId: dto.targetStatusId,
      targetPosition: dto.targetPosition,
    });

    void this.issueBroadcast.broadcastToProjectBoards(
      projectId,
      'issue.moved',
      {
        issueId: result.id,
        newColumnId: result.status,
        newIndex: result.backlogOrder,
        updatedIssueSlim: toBroadcastSlim(result),
      },
    );

    // Audit: ISSUE_MOVED (Severity: LOW). Step 3 fix — stamp the REAL
    // tenant_id from the loaded project relation instead of 'unknown'.
    await this.auditPort.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: issue.project?.organizationId || 'unknown',
      actor_id: userId,
      projectId,
      resource_type: 'Issue',
      resource_id: result.id,
      action_type: 'UPDATE',
      action: 'ISSUE_MOVED',
      metadata: {
        severity: 'LOW',
        targetStatusId: dto.targetStatusId,
        targetPosition: dto.targetPosition,
        newStatus: result.status,
      },
    });

    return result;
  }
}

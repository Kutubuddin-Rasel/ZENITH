import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { IssueRepository } from '../../database/repositories/issue.repository';
import {
  CACHE_INVALIDATOR_TOKEN,
  CACHE_STORE_TOKEN,
} from '../../cache/constants/cache.tokens';
import type {
  ICacheInvalidator,
  ICacheStore,
} from '../../cache/interfaces/cache.interfaces';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ISSUE_EVENT_FACTORY_TOKEN } from '../../common/constants/events.tokens';
import type { IIssueEventFactory } from '../../common/interfaces/event-factory.interfaces';

import { Issue, IssuePriority, IssueType } from '../entities/issue.entity';
import { CreateIssueDto } from '../dto/create-issue.dto';
import { UpdateIssueDto } from '../dto/update-issue.dto';
import type { IIssueCommand } from '../interfaces/issues.interfaces';
import { AuditPort } from '../ports/audit.port';
import { IssueBroadcastPort } from '../ports/issue-broadcast.port';
import { WorkflowStatusLookupPort } from '../ports/workflow-lookup.port';
import { IssueAuthzService } from './issue-authz.service';
import { IssueKeyService } from './issue-key.service';
import { IssueQueryService } from './issue-query.service';
import { toBroadcastSlim } from '../mappers/issue.mapper';

/**
 * IssueCommandService — field-level lifecycle write side.
 *
 * Bound to `ISSUE_COMMAND_TOKEN`. Owns `create`, `update`, `archive`,
 * `unarchive`, `remove`, `updateLabels`. Status-machine changes
 * (`updateStatus` / `moveIssue`) live in `IssueTransitionService` — they
 * carry ACID + after-commit-dispatch obligations this surface does not.
 *
 * Reads are delegated to `IssueQueryService` (cache-through + membership
 * guard) so the read-back semantics stay identical to the god class. All
 * behavior is preserved verbatim from the legacy `IssuesService`.
 */
@Injectable()
export class IssueCommandService implements IIssueCommand {
  constructor(
    private readonly issueRepo: IssueRepository,
    private readonly query: IssueQueryService,
    private readonly keyService: IssueKeyService,
    private readonly authz: IssueAuthzService,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly projectMembersService: IProjectMemberQuery,
    private readonly statusLookup: WorkflowStatusLookupPort,
    private readonly eventEmitter: EventEmitter2,
    @Inject(ISSUE_EVENT_FACTORY_TOKEN)
    private readonly issueEventFactory: IIssueEventFactory,
    private readonly auditPort: AuditPort,
    private readonly issueBroadcast: IssueBroadcastPort,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly cacheInvalidator: ICacheInvalidator,
    private readonly dataSource: DataSource,
  ) {}

  /** Create a new issue & notify. */
  async create(
    projectId: string,
    reporterId: string,
    dto: CreateIssueDto,
  ): Promise<Issue & { key: string }> {
    const project = await this.keyService.findTenantProject(projectId);
    if (!project) throw new NotFoundException('Project not found');

    if (dto.assigneeId) {
      const assigneeRole = await this.projectMembersService.getUserRole(
        projectId,
        dto.assigneeId,
      );
      if (!assigneeRole) {
        throw new BadRequestException('Assignee is not a project member');
      }
    }

    // --- Parent/child validation ---
    let parent: Issue | undefined = undefined;
    if (dto.parentId) {
      parent =
        (await this.issueRepo.findOne({
          where: { id: dto.parentId, projectId },
        })) || undefined;
      if (!parent) {
        throw new BadRequestException('Parent issue not found in this project');
      }
    }

    // --- Workflow status handling ---
    let statusId = dto.statusId;
    let statusName = 'Backlog'; // Default name fallback

    if (statusId) {
      const statusEntity = await this.statusLookup.findById(statusId);
      if (!statusEntity) {
        throw new BadRequestException('Invalid statusId');
      }
      if (statusEntity.projectId !== projectId) {
        throw new BadRequestException('Status does not belong to this project');
      }
      statusName = statusEntity.name;
    } else {
      const defaultStatus = await this.statusLookup.getDefaultStatus(projectId);
      if (defaultStatus) {
        statusId = defaultStatus.id;
        statusName = defaultStatus.name;
      } else {
        const backlog = await this.statusLookup.findByProjectAndName(
          projectId,
          'Backlog',
        );
        if (backlog) {
          statusId = backlog.id;
          statusName = backlog.name;
        }
      }
    }

    const lastIssue = await this.issueRepo.findOne({
      where: { projectId },
      order: { number: 'DESC' },
      select: ['number'],
    });
    const nextNumber = (lastIssue?.number || 0) + 1;

    const issue = this.issueRepo.create({
      projectId,
      title: dto.title,
      description: dto.description,
      status: statusName,
      statusId,
      priority: dto.priority || IssuePriority.MEDIUM,
      type: dto.type || IssueType.TASK,
      assigneeId: dto.assigneeId,
      reporterId,
      parentId: dto.parentId,
      storyPoints: dto.storyPoints || 0,
      number: nextNumber,
    });
    const saved = await this.issueRepo.save(issue);

    await this.cacheInvalidator.invalidateByTags([
      `project:${projectId}: issues`,
    ]);

    const { type, payload } = this.issueEventFactory.create('issue.created', {
      projectId,
      issueId: saved.id,
      actorId: reporterId,
    });
    this.eventEmitter.emit(type, payload);

    // Audit: ISSUE_CREATED (Severity: MEDIUM)
    await this.auditPort.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: project.organizationId || 'unknown',
      actor_id: reporterId,
      projectId,
      resource_type: 'Issue',
      resource_id: saved.id,
      action_type: 'CREATE',
      action: 'ISSUE_CREATED',
      metadata: {
        severity: 'MEDIUM',
        issueTitle: saved.title,
        issueKey: `${project.key}-${nextNumber}`,
        issueType: saved.type,
        priority: saved.priority,
      },
    });

    const enriched = await this.keyService.enrichWithKey(saved, project.key);

    void this.issueBroadcast.broadcastToProjectBoards(
      projectId,
      'issue.created',
      { issue: toBroadcastSlim(enriched) },
    );

    return enriched;
  }

  /** Update an issue & notify on status-change / reassign. */
  async update(
    projectId: string,
    issueId: string,
    userId: string,
    dto: UpdateIssueDto,
    organizationId?: string,
  ): Promise<Issue> {
    const issue = await this.query.findOne(
      projectId,
      issueId,
      userId,
      organizationId,
    );
    const userRole = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );

    // Optimistic Locking
    if (
      dto.expectedVersion !== undefined &&
      issue.version !== dto.expectedVersion
    ) {
      throw new ConflictException({
        message:
          'This issue was modified by another user. Please refresh and try again.',
        currentVersion: issue.version,
        yourVersion: dto.expectedVersion,
        lastUpdated: issue.updatedAt,
      });
    }

    // Permission check
    if (userRole !== ProjectRole.PROJECT_LEAD) {
      const isAssignee = issue.assigneeId === userId;
      const isReporter = issue.reporterId === userId;
      if (!isAssignee && !isReporter) {
        throw new ForbiddenException('You cannot update this issue');
      }
    }

    // Handle reassign/unassign
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId === null || dto.assigneeId === '') {
        issue.assigneeId = null;
        this.eventEmitter.emit('issue.updated', {
          projectId,
          issueId: issue.id,
          actorId: userId,
          action: 'unassigned issue',
        });
      } else if (dto.assigneeId !== issue.assigneeId) {
        const asRole = await this.projectMembersService.getUserRole(
          projectId,
          dto.assigneeId,
        );
        if (!asRole) {
          throw new BadRequestException('New assignee is not a project member');
        }

        if (
          userRole !== ProjectRole.PROJECT_LEAD &&
          issue.assigneeId !== userId
        ) {
          throw new ForbiddenException(
            'Only ProjectLead or current assignee can reassign issues',
          );
        }

        issue.assigneeId = dto.assigneeId;
        this.eventEmitter.emit('issue.updated', {
          projectId,
          issueId: issue.id,
          actorId: userId,
          action: `reassigned issue to ${dto.assigneeId} `,
        });
      }
    }

    // Handle status-change (via statusId)
    if (dto.statusId && dto.statusId !== issue.statusId) {
      const newStatus = await this.statusLookup.findById(dto.statusId);
      if (!newStatus) throw new BadRequestException('Invalid statusId');

      issue.statusId = dto.statusId;
      issue.status = newStatus.name;

      this.eventEmitter.emit('issue.updated', {
        projectId,
        issueId: issue.id,
        actorId: userId,
        action: `changed status to ${newStatus.name}`,
      });
    }

    // --- Parent/child validation ---
    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        issue.parentId = undefined;
      } else if (dto.parentId === issue.id) {
        throw new BadRequestException('An issue cannot be its own parent');
      } else {
        const parent = await this.issueRepo.findOne({
          where: { id: dto.parentId, projectId },
        });
        if (!parent) {
          throw new BadRequestException(
            'Parent issue not found in this project',
          );
        }
        issue.parentId = dto.parentId;
      }
    }

    // VECTOR SYNC: capture old text BEFORE mutation for diff check.
    const oldTitle = issue.title;
    const oldDescription = issue.description;

    if (dto.title !== undefined) issue.title = dto.title;
    if (dto.description !== undefined) issue.description = dto.description;
    if (dto.priority !== undefined) issue.priority = dto.priority;
    if (dto.type !== undefined) issue.type = dto.type;
    if (dto.storyPoints !== undefined) issue.storyPoints = dto.storyPoints;

    const savedIssue = await this.issueRepo.save(issue);

    await this.cacheStore.del(`issue:${issueId} `);

    const updatedIssue = await this.query.findOne(
      projectId,
      savedIssue.id,
      userId,
      organizationId,
    );

    void this.issueBroadcast.broadcastToProjectBoards(
      projectId,
      'issue.updated',
      { issue: toBroadcastSlim(updatedIssue) },
    );

    // VECTOR SYNC: emit only if text content actually changed (post-save).
    const titleChanged = dto.title !== undefined && dto.title !== oldTitle;
    const descChanged =
      dto.description !== undefined && dto.description !== oldDescription;
    if (titleChanged || descChanged) {
      this.eventEmitter.emit('issue.text-changed', {
        issueId: issue.id,
        projectId,
      });
    }

    // Audit: ISSUE_UPDATED (Severity: LOW)
    await this.auditPort.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: updatedIssue.project?.organizationId || 'unknown',
      actor_id: userId,
      projectId,
      resource_type: 'Issue',
      resource_id: issueId,
      action_type: 'UPDATE',
      action: 'ISSUE_UPDATED',
      metadata: {
        severity: 'LOW',
        issueTitle: updatedIssue.title,
        issueNumber: updatedIssue.number,
      },
    });

    return updatedIssue;
  }

  /** Archive an issue. */
  async archive(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Issue> {
    const issue = await this.query.findOne(
      projectId,
      issueId,
      userId,
      organizationId,
    );
    await this.authz.requireLeadOrSuperAdmin(projectId, userId, 'archive');

    if (issue.isArchived) {
      throw new BadRequestException('Issue is already archived');
    }

    issue.isArchived = true;
    issue.archivedAt = new Date();
    issue.archivedBy = userId;

    await this.issueRepo.save(issue);
    await this.cacheStore.del(`issue:${issueId} `);

    this.eventEmitter.emit('issue.archived', {
      projectId,
      issueId,
      actorId: userId,
    });

    return issue;
  }

  /** Unarchive an issue. */
  async unarchive(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Issue> {
    const issue = await this.issueRepo.findOne({
      where: { id: issueId, projectId },
      relations: ['parent', 'children', 'assignee', 'reporter', 'project'],
    });

    if (!issue) {
      throw new NotFoundException('Issue not found in this project');
    }

    if (organizationId && issue.project.organizationId !== organizationId) {
      throw new NotFoundException('Issue not found in this project');
    }

    await this.authz.requireLeadOrSuperAdmin(projectId, userId, 'unarchive');

    if (!issue.isArchived) {
      throw new BadRequestException('Issue is not archived');
    }

    issue.isArchived = false;
    issue.archivedAt = null;
    issue.archivedBy = null;

    await this.issueRepo.save(issue);
    await this.cacheStore.del(`issue:${issueId} `);

    this.eventEmitter.emit('issue.unarchived', {
      projectId,
      issueId,
      actorId: userId,
    });

    return issue;
  }

  /** Delete an issue & notify. */
  async remove(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    const issue = await this.query.findOne(
      projectId,
      issueId,
      userId,
      organizationId,
    );
    await this.authz.requireLeadOrSuperAdmin(projectId, userId, 'delete');

    await this.issueRepo.remove(issue);
    await this.cacheStore.del(`issue:${issueId} `);

    this.eventEmitter.emit('issue.deleted', {
      projectId,
      issueId,
      actorId: userId,
    });

    // Audit: ISSUE_DELETED (Severity: HIGH — irreversible).
    try {
      await this.auditPort.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: issue.project?.organizationId || 'unknown',
        actor_id: userId,
        projectId,
        resource_type: 'Issue',
        resource_id: issueId,
        action_type: 'DELETE',
        action: 'ISSUE_DELETED',
        metadata: {
          severity: 'HIGH',
          issueTitle: issue.title,
          issueNumber: issue.number,
        },
      });
    } catch (auditError) {
      console.error('Audit log failed for ISSUE_DELETED:', auditError);
    }

    void this.issueBroadcast.broadcastToProjectBoards(
      projectId,
      'issue.deleted',
      { issueId },
    );
  }

  /** Update labels (unique, trimmed) inside a transaction. */
  async updateLabels(
    projectId: string,
    issueId: string,
    labels: string[],
    userId: string,
  ): Promise<Issue> {
    const issue = await this.query.findOne(projectId, issueId, userId);

    const uniqueLabels = [
      ...new Set(labels.map((l) => l.trim()).filter(Boolean)),
    ];
    issue.labels = uniqueLabels;

    const saved = await this.dataSource.transaction(async (manager) => {
      const res = await manager.save(issue);
      return res;
    });

    this.eventEmitter.emit('issue.updated', {
      projectId,
      issueId: issue.id,
      actorId: userId,
      action: 'updated labels',
    });

    return saved;
  }
}

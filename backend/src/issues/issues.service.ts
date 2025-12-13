// src/issues/issues.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Issue,
  IssueStatus,
  IssuePriority,
  IssueType,
} from './entities/issue.entity';
import { IssueLink, LinkType } from './entities/issue-link.entity';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { UsersService } from '../users/users.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkLog } from './entities/work-log.entity';

import { CacheService } from '../cache/cache.service';
import { WorkflowTransitionsService } from '../workflows/services/workflow-transitions.service';

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue)
    private readonly issueRepo: Repository<Issue>,
    @InjectRepository(IssueLink)
    private readonly issueLinkRepo: Repository<IssueLink>,
    private readonly projectsService: ProjectsService,
    private readonly projectMembersService: ProjectMembersService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(WorkLog)
    private workLogRepo: Repository<WorkLog>,
    private readonly cacheService: CacheService,
    private readonly transitionsService: WorkflowTransitionsService,
  ) { }

  /**
   * Compute friendly issue key from project key and issue number.
   * Example: project.key = "ZEN", issue.number = 42 → "ZEN-42"
   */
  private computeKey(projectKey: string, issueNumber: number | null): string {
    if (!issueNumber) return '';
    return `${projectKey}-${issueNumber}`;
  }

  /**
   * Enrich issue with computed key.
   * Use this when returning issues to include the friendly key.
   */
  private async enrichWithKey(
    issue: Issue,
    projectKey?: string,
  ): Promise<Issue & { key: string }> {
    let key = projectKey;
    if (!key) {
      const project = await this.projectsService.findOneById(issue.projectId);
      key = project.key;
    }
    return {
      ...issue,
      key: this.computeKey(key, issue.number),
    };
  }

  /** Create a new issue & notify */
  async create(
    projectId: string,
    reporterId: string,
    dto: CreateIssueDto,
    organizationId?: string,
  ): Promise<Issue & { key: string }> {
    // Validate project exists and belongs to organization
    const project = await this.projectsService.findOneById(projectId, organizationId);
    // Permission checks handled by @RequireProjectRole and PermissionsGuard

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
      if (dto.parentId === undefined || dto.parentId === null) {
        // skip
      } else {
        parent =
          (await this.issueRepo.findOne({
            where: { id: dto.parentId, projectId },
          })) || undefined;
        if (!parent) {
          throw new BadRequestException(
            'Parent issue not found in this project',
          );
        }
      }
    }

    // Linear-style: status is simply the column name (e.g., "Backlog", "Design", "Done")
    // Default to "Backlog" if no status provided
    const status = dto.status || 'Backlog';

    // Get next issue number
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
      status,
      priority: dto.priority || IssuePriority.MEDIUM,
      assigneeId: dto.assigneeId,
      reporterId,
      parentId: dto.parentId,
      storyPoints: dto.storyPoints || 0,
      number: nextNumber,
    });
    const saved = await this.issueRepo.save(issue);

    // Invalidate project issues cache if it existed (e.g. list cache)
    await this.cacheService.invalidateByTags([`project:${projectId}:issues`]);

    this.eventEmitter.emit('issue.created', {
      projectId,
      issueId: saved.id,
      actorId: reporterId,
    });

    // Return with computed friendly key (e.g., "ZEN-42")
    return this.enrichWithKey(saved, project.key);
  }

  /** List issues (no notification) */
  async findAll(
    projectId: string,
    userId: string,
    filters?: {
      status?: IssueStatus;
      assigneeId?: string;
      search?: string;
      label?: string;
      sprint?: string;
      sort?: string;
      includeArchived?: boolean;
      type?: string;
    },
    organizationId?: string,
  ): Promise<Issue[]> {
    // Verify project access (pass organizationId, not userId)
    await this.projectsService.findOneById(projectId, organizationId);

    const qb = this.issueRepo
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.assignee', 'assignee') // Only users have assignee
      // Note: Sprint relation is managed via sprint_issues join table, not direct relation
      // .leftJoinAndSelect('issue.labels', 'labels')
      .where('issue.project.id = :projectId', { projectId });

    // Note: Organization access is already validated via projectsService.findOneById above

    // Filter archived issues unless explicitly requested
    if (!filters?.includeArchived) {
      qb.andWhere('issue.isArchived = :isArchived', { isArchived: false });
    }

    if (filters) {
      if (filters.status) {
        qb.andWhere('issue.status = :status', { status: filters.status });
      }
      if (filters.assigneeId) {
        qb.andWhere('assignee.id = :assigneeId', {
          assigneeId: filters.assigneeId,
        });
      }
      if (filters.type) {
        qb.andWhere('issue.type = :type', { type: filters.type });
      }
      if (filters.search) {
        qb.andWhere(
          '(issue.title ILIKE :search OR issue.description ILIKE :search)',
          { search: `%${filters.search}%` },
        );
      }
      if (filters.label) {
        // Assuming labels are storing in simple-array 'labels' column
        // For array column in Postgres, use array operators
        // qb.andWhere(':label = ANY(issue.labels)', { label: filters.label });
        // BUT current entity uses simple-array which is comma-separated string in DB (usually)
        // or just array in TypeORM logic but string in DB.
        // If simple-array, it's a string like "label1,label2".
        // Use LIKE for simple-array
        qb.andWhere('issue.labels ILIKE :label', {
          label: `%${filters.label}%`,
        });
      }
      // Sprint filter - uses sprint_issues join table
      if (filters.sprint) {
        if (filters.sprint === 'null') {
          // Issues NOT in any sprint
          // Left join sprint_issues and check for NULL
          qb.leftJoin('sprint_issues', 'si_null', 'si_null.issueId = issue.id');
          qb.andWhere('si_null.id IS NULL');
        } else {
          // Issues in a specific sprint
          // Inner join to filter
          qb.innerJoin('sprint_issues', 'si', 'si.issueId = issue.id');
          qb.andWhere('si.sprintId = :sprintId', { sprintId: filters.sprint });
        }
      }

      // Sorting
      if (filters.sort) {
        if (filters.sort === 'updatedAt') {
          qb.orderBy('issue.updatedAt', 'DESC');
        } else if (filters.sort === 'priority') {
          qb.addOrderBy(
            `CASE 
          WHEN issue.priority = 'Highest' THEN 5
          WHEN issue.priority = 'High' THEN 4
          WHEN issue.priority = 'Medium' THEN 3
          WHEN issue.priority = 'Low' THEN 2
          WHEN issue.priority = 'Lowest' THEN 1
          ELSE 0 END`,
            'DESC',
          );
          qb.addOrderBy('issue.createdAt', 'DESC'); // secondary sort
        } else {
          qb.orderBy('issue.createdAt', 'DESC');
        }
      } else {
        qb.orderBy('issue.createdAt', 'DESC');
      }
    }

    // OPTIMIZED: Only load essential columns for list view
    qb.select([
      'issue.id',
      'issue.projectId',
      'issue.title',
      'issue.status',
      'issue.priority',
      'issue.type',
      'issue.assigneeId',
      'issue.reporterId',
      'issue.storyPoints',
      'issue.createdAt',
      'issue.updatedAt',
      'issue.labels',
      // User relations (names only)
      'assignee.id',
      'assignee.name',
      'assignee.email',
    ]);

    qb.leftJoinAndSelect('issue.reporter', 'reporter'); // Keep reporter join for selection
    qb.addSelect(['reporter.id', 'reporter.name', 'reporter.email']); // Add reporter fields to select

    return qb.getMany();
  }

  /** Get one issue (no notification) */
  async findOne(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Issue> {
    // Try cache first
    const cacheKey = `issue:${issueId}`;
    const cachedIssue = await this.cacheService.get<Issue>(cacheKey);

    if (cachedIssue) {
      // Validate project context
      if (cachedIssue.projectId !== projectId) {
        throw new NotFoundException('Issue not found in this project');
      }
      // Validate organization access
      if (
        organizationId &&
        cachedIssue.project?.organizationId !== organizationId
      ) {
        throw new NotFoundException('Issue not found in this project');
      }

      // Still need to check membership permissions as they might have changed
      const role = await this.projectMembersService.getUserRole(
        projectId,
        userId,
      );
      if (!role) {
        throw new ForbiddenException('You are not a member of this project');
      }

      return cachedIssue;
    }

    const issue = await this.issueRepo.findOne({
      where: { id: issueId, projectId },
      relations: ['parent', 'children', 'assignee', 'reporter', 'project'],
    });
    if (!issue) {
      throw new NotFoundException('Issue not found in this project');
    }

    // Validate organization access
    if (organizationId && issue.project.organizationId !== organizationId) {
      throw new NotFoundException('Issue not found in this project');
    }

    const role = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );
    if (!role) {
      throw new ForbiddenException('You are not a member of this project');
    }

    // Cache the issue
    await this.cacheService.set(cacheKey, issue, {
      ttl: 900, // 15 minutes
      tags: [`issue:${issueId}`, `project:${projectId}:issues`],
    });

    return issue;
  }

  /** Update an issue & notify on status-change, reassign */
  async update(
    projectId: string,
    issueId: string,
    userId: string,
    dto: UpdateIssueDto,
    organizationId?: string,
  ): Promise<Issue> {
    const issue = await this.findOne(
      projectId,
      issueId,
      userId,
      organizationId,
    );
    const userRole = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );

    // Optimistic Locking: check if another user has modified this issue
    if (dto.expectedVersion !== undefined && issue.version !== dto.expectedVersion) {
      throw new ConflictException({
        message: 'This issue was modified by another user. Please refresh and try again.',
        currentVersion: issue.version,
        yourVersion: dto.expectedVersion,
        lastUpdated: issue.updatedAt,
      });
    }

    // Check permissions
    if (userRole !== ProjectRole.PROJECT_LEAD) {
      const isAssignee = issue.assigneeId === userId;
      const isReporter = issue.reporterId === userId;
      if (!isAssignee && !isReporter) {
        throw new ForbiddenException('You cannot update this issue');
      }
    }

    // Handle reassign/unassign
    if (dto.assigneeId !== undefined) {
      // Allow unassignment (setting to null/undefined)
      if (dto.assigneeId === null || dto.assigneeId === '') {
        issue.assigneeId = null;
        this.eventEmitter.emit('issue.updated', {
          projectId,
          issueId: issue.id,
          actorId: userId,
          action: 'unassigned issue',
        });
      }
      // Handle assignment to a new user
      else if (dto.assigneeId !== issue.assigneeId) {
        // Check if the new assignee is a project member
        const asRole = await this.projectMembersService.getUserRole(
          projectId,
          dto.assigneeId,
        );
        if (!asRole) {
          throw new BadRequestException('New assignee is not a project member');
        }

        // Permission check: Only ProjectLead or the current assignee can change assignment
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
          action: `reassigned issue to ${dto.assigneeId}`,
        });
      }
    }

    // Handle status-change
    if (dto.status && (dto.status as string) !== issue.status) {
      issue.status = dto.status;
      this.eventEmitter.emit('issue.updated', {
        projectId,
        issueId: issue.id,
        actorId: userId,
        action: `changed status to ${dto.status}`,
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

    if (dto.title !== undefined) issue.title = dto.title;
    if (dto.description !== undefined) issue.description = dto.description;
    if (dto.priority !== undefined) issue.priority = dto.priority;
    if (dto.type !== undefined) issue.type = dto.type;
    if (dto.storyPoints !== undefined) issue.storyPoints = dto.storyPoints;

    const savedIssue = await this.issueRepo.save(issue);

    // Invalidate cache
    await this.cacheService.del(`issue:${issueId}`);

    // Return the issue with relations loaded
    return this.findOne(projectId, savedIssue.id, userId, organizationId);
  }

  /** Archive an issue */
  async archive(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Issue> {
    const issue = await this.findOne(
      projectId,
      issueId,
      userId,
      organizationId,
    );
    const user = await this.usersService.findOneById(userId);
    const userRole = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );

    if (!user?.isSuperAdmin && userRole !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException(
        'Only ProjectLead or Super Admin can archive issues',
      );
    }

    if (issue.isArchived) {
      throw new BadRequestException('Issue is already archived');
    }

    issue.isArchived = true;
    issue.archivedAt = new Date();
    issue.archivedBy = userId;

    await this.issueRepo.save(issue);

    // Invalidate cache
    await this.cacheService.del(`issue:${issueId}`);

    this.eventEmitter.emit('issue.archived', {
      projectId,
      issueId,
      actorId: userId,
    });

    return issue;
  }

  /** Unarchive an issue */
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

    // Validate organization access
    if (organizationId && issue.project.organizationId !== organizationId) {
      throw new NotFoundException('Issue not found in this project');
    }

    const user = await this.usersService.findOneById(userId);
    const userRole = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );

    if (!user?.isSuperAdmin && userRole !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException(
        'Only ProjectLead or Super Admin can unarchive issues',
      );
    }

    if (!issue.isArchived) {
      throw new BadRequestException('Issue is not archived');
    }

    issue.isArchived = false;
    issue.archivedAt = null;
    issue.archivedBy = null;

    await this.issueRepo.save(issue);

    // Invalidate cache
    await this.cacheService.del(`issue:${issueId}`);

    this.eventEmitter.emit('issue.unarchived', {
      projectId,
      issueId,
      actorId: userId,
    });

    return issue;
  }

  /** Delete an issue & notify */
  async remove(
    projectId: string,
    issueId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    const issue = await this.findOne(
      projectId,
      issueId,
      userId,
      organizationId,
    );
    const user = await this.usersService.findOneById(userId);
    const userRole = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );

    if (!user?.isSuperAdmin && userRole !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException(
        'Only ProjectLead or Super Admin can delete issues',
      );
    }
    await this.issueRepo.remove(issue);

    // Invalidate cache
    await this.cacheService.del(`issue:${issueId}`);

    this.eventEmitter.emit('issue.deleted', {
      projectId,
      issueId,
      actorId: userId,
    });
  }

  /**
   * Update issue status.
   * Linear-style: status is simply the column name (e.g., "Design", "Testing", "Done")
   * Validates transitions if workflow rules are configured for the project.
   */
  async updateStatus(
    projectId: string,
    issueId: string,
    status: string,
    userId: string,
  ): Promise<Issue> {
    const issue = await this.findOne(projectId, issueId, userId);
    const userRole = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );

    // State Machine Enforcement: check if transition is allowed
    const transitionCheck = await this.transitionsService.isTransitionAllowed(
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

    // Linear-style: just set the status to the column name
    issue.status = status;

    // Emit event
    this.eventEmitter.emit('issue.updated', {
      projectId,
      issueId: issue.id,
      actorId: userId,
      action: `changed status to ${status}`,
      transitionName: transitionCheck.transitionName,
    });

    return this.issueRepo.save(issue);
  }

  /**
   * Add a semantic link between issues.
   */
  async addLink(
    projectId: string,
    sourceIssueId: string,
    targetIssueId: string,
    type: LinkType,
    userId: string,
  ): Promise<IssueLink> {
    // Verify source exists and user has access
    await this.findOne(projectId, sourceIssueId, userId);

    // Verify target exists and user has access
    const target = await this.issueRepo.findOne({
      where: { id: targetIssueId },
    });
    if (!target) throw new NotFoundException('Target issue not found');

    // Prevent linking to self
    if (sourceIssueId === targetIssueId) {
      throw new BadRequestException('Cannot link issue to itself');
    }

    // Check if link already exists
    const existing = await this.issueLinkRepo.findOne({
      where: [{ sourceIssueId, targetIssueId }],
    });
    if (existing) throw new BadRequestException('Link already exists');

    const link = this.issueLinkRepo.create({
      sourceIssueId,
      targetIssueId,
      type,
    });
    return this.issueLinkRepo.save(link);
  }

  /** Remove a link */
  async removeLink(
    projectId: string,
    linkId: string,
    userId: string,
  ): Promise<void> {
    const link = await this.issueLinkRepo.findOne({
      where: { id: linkId },
      relations: ['sourceIssue'],
    });
    if (!link) throw new NotFoundException('Link not found');

    // Check permission on source issue
    await this.findOne(projectId, link.sourceIssueId, userId);

    await this.issueLinkRepo.remove(link);
  }

  /** Get links for an issue */
  async getLinks(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<IssueLink[]> {
    await this.findOne(projectId, issueId, userId);

    // Get both: where issue is source AND where issue is target
    const links = await this.issueLinkRepo.find({
      where: [{ sourceIssueId: issueId }, { targetIssueId: issueId }],
      relations: ['sourceIssue', 'targetIssue'],
    });
    return links;
  }

  /** Update labels */
  async updateLabels(
    projectId: string,
    issueId: string,
    labels: string[],
    userId: string,
  ): Promise<Issue> {
    const issue = await this.findOne(projectId, issueId, userId);

    // Enforce unique, trimmed labels
    const uniqueLabels = [
      ...new Set(labels.map((l) => l.trim()).filter(Boolean)),
    ];
    issue.labels = uniqueLabels;

    const saved = await this.issueLinkRepo.manager.transaction(
      async (manager) => {
        const res = await manager.save(issue);
        // We could also update a separate "Label" entity table here for analytics if we had one
        return res;
      },
    );

    this.eventEmitter.emit('issue.updated', {
      projectId,
      issueId: issue.id,
      actorId: userId,
      action: 'updated labels',
    });

    return saved;
  }

  /** Stream issues for export */
  async getIssuesStream(
    projectId: string,
    userId: string,
    organizationId?: string,
  ): Promise<NodeJS.ReadableStream> {
    // Validate project belongs to organization
    if (organizationId) {
      await this.projectsService.findOneById(projectId, organizationId);
    }

    const role = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );
    if (!role) {
      throw new ForbiddenException('You are not a member of this project');
    }

    const qb = this.issueRepo.createQueryBuilder('issue');
    qb.where('issue.projectId = :projectId', { projectId });
    qb.orderBy('issue.createdAt', 'DESC');

    // Select specific fields for export to keep it clean and performant
    qb.select([
      'issue.id AS issue_id',
      'issue.title AS issue_title',
      'issue.description AS issue_description',
      'issue.status AS issue_status',
      'issue.priority AS issue_priority',
      'issue.type AS issue_type',
      'issue.storyPoints AS issue_storyPoints',
      'issue.createdAt AS issue_createdAt',
      'issue.updatedAt AS issue_updatedAt',
      'assignee.name AS assignee_name',
      'assignee.email AS assignee_email',
      'reporter.name AS reporter_name',
      'reporter.email AS reporter_email',
      'parent.title AS parent_title',
    ]);

    qb.leftJoin('issue.parent', 'parent');
    qb.leftJoin('issue.assignee', 'assignee');
    qb.leftJoin('issue.reporter', 'reporter');

    return qb.stream();
  }

  /** Import issues from CSV */
  async importIssues(
    projectId: string,
    fileBuffer: Buffer,
    userId: string,
    organizationId?: string,
  ): Promise<{ created: number; failed: number; errors: string[] }> {
    // Validate project belongs to organization
    if (organizationId) {
      await this.projectsService.findOneById(projectId, organizationId);
    }

    const role = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );
    if (!role) {
      throw new ForbiddenException('You are not a member of this project');
    }

    const csvContent = fileBuffer.toString('utf-8');
    const rows = this.parseCSV(csvContent);

    if (rows.length === 0) {
      throw new BadRequestException('CSV file is empty');
    }

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const dataRows = rows.slice(1);

    let created = 0;
    let failed = 0;
    const errors: string[] = [];

    // Map headers to indices
    const colMap = {
      title: headers.indexOf('title'),
      description: headers.indexOf('description'),
      status: headers.indexOf('status'),
      priority: headers.indexOf('priority'),
      type: headers.indexOf('type'),
      storyPoints: headers.indexOf('story points'),
      assigneeEmail: headers.indexOf('assignee email'),
      parentTitle: headers.indexOf('parent issue'),
    };

    if (colMap.title === -1) {
      throw new BadRequestException('CSV must contain a "Title" column');
    }

    for (const [index, row] of dataRows.entries()) {
      try {
        const title = row[colMap.title];
        if (!title) continue; // Skip empty rows

        const description =
          colMap.description !== -1 ? row[colMap.description] : undefined;
        const status =
          colMap.status !== -1
            ? (row[colMap.status] as IssueStatus)
            : IssueStatus.TODO;
        const priority =
          colMap.priority !== -1
            ? (row[colMap.priority] as IssuePriority)
            : IssuePriority.MEDIUM;
        const type =
          colMap.type !== -1 ? (row[colMap.type] as IssueType) : undefined;
        const storyPoints =
          colMap.storyPoints !== -1 ? parseInt(row[colMap.storyPoints], 10) : 0;
        const assigneeEmail =
          colMap.assigneeEmail !== -1 ? row[colMap.assigneeEmail] : undefined;
        const parentTitle =
          colMap.parentTitle !== -1 ? row[colMap.parentTitle] : undefined;

        // Resolve Assignee
        let assigneeId: string | undefined;
        if (assigneeEmail) {
          const user = await this.usersService.findOneByEmail(assigneeEmail);
          if (user) {
            // Check if user is member
            const isMember = await this.projectMembersService.getUserRole(
              projectId,
              user.id,
            );
            if (isMember) assigneeId = user.id;
          }
        }

        // Resolve Parent
        let parentId: string | undefined;
        if (parentTitle) {
          const parent = await this.issueRepo.findOne({
            where: { title: parentTitle, projectId },
          });
          if (parent) parentId = parent.id;
        }

        const issue = this.issueRepo.create({
          projectId,
          title,
          description,
          status,
          priority,
          type,
          storyPoints: isNaN(storyPoints) ? 0 : storyPoints,
          assigneeId,
          reporterId: userId,
          parentId,
        });

        await this.issueRepo.save(issue);
        created++;
      } catch (err) {
        failed++;
        errors.push(`Row ${index + 2}: ${(err as Error).message}`);
      }
    }

    return { created, failed, errors };
  }

  private parseCSV(content: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentRow.push(currentField);
        currentField = '';
      } else if (
        (char === '\n' || (char === '\r' && nextChar === '\n')) &&
        !insideQuotes
      ) {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        if (char === '\r') i++; // Skip \n
      } else {
        currentField += char;
      }
    }

    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows;
  }
}

@Injectable()
export class WorkLogsService {
  constructor(
    @InjectRepository(WorkLog)
    private workLogRepo: Repository<WorkLog>,
    @InjectRepository(Issue)
    private issueRepo: Repository<Issue>,
    private membersService: ProjectMembersService,
  ) { }

  async listWorkLogs(projectId: string, issueId: string) {
    return this.workLogRepo.find({
      where: { projectId, issueId },
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
  }

  async addWorkLog(
    projectId: string,
    issueId: string,
    userId: string,
    minutesSpent: number,
    note?: string,
  ) {
    // Ensure user is a project member and issue exists
    await this.issueRepo.findOneByOrFail({ id: issueId, projectId });
    // Optionally: check membership
    const workLog = this.workLogRepo.create({
      projectId,
      issueId,
      userId,
      minutesSpent,
      note,
    });
    return this.workLogRepo.save(workLog);
  }

  async deleteWorkLog(
    projectId: string,
    issueId: string,
    workLogId: string,
    userId: string,
  ) {
    const workLog = await this.workLogRepo.findOneBy({
      id: workLogId,
      projectId,
      issueId,
    });
    if (!workLog) throw new NotFoundException('Work log not found');
    // Only the user or ProjectLead can delete
    if (workLog.userId !== userId) {
      const role = await this.membersService.getUserRole(projectId, userId);
      if (role !== ProjectRole.PROJECT_LEAD)
        throw new ForbiddenException('Cannot delete this work log');
    }
    await this.workLogRepo.remove(workLog);
    return { message: 'Work log deleted' };
  }

  async updateWorkLog(
    projectId: string,
    issueId: string,
    workLogId: string,
    userId: string,
    minutesSpent?: number,
    note?: string,
  ) {
    const workLog = await this.workLogRepo.findOneBy({
      id: workLogId,
      projectId,
      issueId,
    });
    if (!workLog) throw new NotFoundException('Work log not found');
    // Only the user or ProjectLead can edit
    if (workLog.userId !== userId) {
      const role = await this.membersService.getUserRole(projectId, userId);
      if (role !== ProjectRole.PROJECT_LEAD)
        throw new ForbiddenException('Cannot edit this work log');
    }
    if (minutesSpent !== undefined) workLog.minutesSpent = minutesSpent;
    if (note !== undefined) workLog.note = note;
    return this.workLogRepo.save(workLog);
  }
}

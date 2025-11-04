// src/issues/issues.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Issue, IssueStatus, IssuePriority } from './entities/issue.entity';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { UsersService } from '../users/users.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkLog } from './entities/work-log.entity';

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue)
    private readonly issueRepo: Repository<Issue>,
    private readonly projectsService: ProjectsService,
    private readonly projectMembersService: ProjectMembersService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(WorkLog)
    private workLogRepo: Repository<WorkLog>,
  ) {}

  /** Create a new issue & notify */
  async create(
    projectId: string,
    reporterId: string,
    dto: CreateIssueDto,
  ): Promise<Issue> {
    await this.projectsService.findOneById(projectId);

    const reporterRole = await this.projectMembersService.getUserRole(
      projectId,
      reporterId,
    );
    if (!reporterRole) {
      throw new ForbiddenException('You are not a member of this project');
    }
    if (['Viewer'].includes(reporterRole)) {
      throw new ForbiddenException('Your role cannot create issues');
    }

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

    const issue = this.issueRepo.create({
      projectId,
      title: dto.title,
      description: dto.description,
      status: dto.status || IssueStatus.TODO,
      priority: dto.priority || IssuePriority.MEDIUM,
      assigneeId: dto.assigneeId,
      reporterId,
      parentId: dto.parentId,
      storyPoints: dto.storyPoints || 0,
    });
    const saved = await this.issueRepo.save(issue);

    this.eventEmitter.emit('issue.created', {
      projectId,
      issueId: saved.id,
      actorId: reporterId,
    });

    return saved;
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
    },
  ): Promise<Issue[]> {
    const role = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );
    if (!role) {
      throw new ForbiddenException('You are not a member of this project');
    }

    const qb = this.issueRepo.createQueryBuilder('issue');
    qb.where('issue.projectId = :projectId', { projectId });
    if (filters?.status) {
      qb.andWhere('issue.status = :status', { status: filters.status });
    }
    if (filters?.assigneeId) {
      qb.andWhere('issue.assigneeId = :assigneeId', {
        assigneeId: filters.assigneeId,
      });
    }
    if (filters?.search) {
      qb.andWhere(
        '(issue.title ILIKE :search OR issue.description ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }
    if (filters?.label) {
      qb.innerJoin(
        'taxonomy_issue_labels',
        'il',
        'il.issueId = issue.id',
      ).andWhere('il.labelId = :labelId', { labelId: filters.label });
    }
    if (filters?.sprint) {
      qb.innerJoin('sprint_issues', 'si', 'si.issueId = issue.id').andWhere(
        'si.sprintId = :sprintId',
        { sprintId: filters.sprint },
      );
    }
    // Sorting
    if (filters?.sort) {
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
    qb.leftJoinAndSelect('issue.parent', 'parent');
    qb.leftJoinAndSelect('issue.children', 'children');
    qb.leftJoinAndSelect('issue.assignee', 'assignee');
    qb.leftJoinAndSelect('issue.reporter', 'reporter');
    const issues = await qb.getMany();

    // Debug logging
    console.log(
      'Backend findAll - Issues with assignee data:',
      issues.map((issue) => ({
        id: issue.id,
        title: issue.title,
        assigneeId: issue.assigneeId,
        assignee: issue.assignee,
        assigneeName: issue.assignee?.name,
      })),
    );

    return issues;
  }

  /** Get one issue (no notification) */
  async findOne(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<Issue> {
    const issue = await this.issueRepo.findOne({
      where: { id: issueId, projectId },
      relations: ['parent', 'children', 'assignee', 'reporter'],
    });
    if (!issue) {
      throw new NotFoundException('Issue not found in this project');
    }
    const role = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );
    if (!role) {
      throw new ForbiddenException('You are not a member of this project');
    }
    return issue;
  }

  /** Update an issue & notify on status-change, reassign */
  async update(
    projectId: string,
    issueId: string,
    userId: string,
    dto: UpdateIssueDto,
  ): Promise<Issue> {
    const issue = await this.findOne(projectId, issueId, userId);
    const userRole = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );

    // Check permissions
    if (userRole !== 'ProjectLead') {
      const isAssignee = issue.assigneeId === userId;
      const isReporter = issue.reporterId === userId;
      if (!isAssignee && !isReporter) {
        throw new ForbiddenException('You cannot update this issue');
      }
    }

    // Handle reassign/unassign
    if (dto.assigneeId !== undefined) {
      console.log('Backend update - Processing assignee change:', {
        currentAssigneeId: issue.assigneeId,
        newAssigneeId: dto.assigneeId,
        currentAssignee: issue.assignee,
      });

      // Allow unassignment (setting to null/undefined)
      if (dto.assigneeId === null || dto.assigneeId === '') {
        issue.assigneeId = null;
        console.log('Backend update - Unassigning issue');
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
        if (userRole !== 'ProjectLead' && issue.assigneeId !== userId) {
          throw new ForbiddenException(
            'Only ProjectLead or current assignee can reassign issues',
          );
        }

        issue.assigneeId = dto.assigneeId;
        console.log('Backend update - Reassigning issue to:', dto.assigneeId);
        this.eventEmitter.emit('issue.updated', {
          projectId,
          issueId: issue.id,
          actorId: userId,
          action: `reassigned issue to ${dto.assigneeId}`,
        });
      }
    }

    // Handle status-change
    if (dto.status && dto.status !== issue.status) {
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

    console.log('Backend update - Saved issue:', {
      id: savedIssue.id,
      assigneeId: savedIssue.assigneeId,
      assignee: savedIssue.assignee,
    });

    // Return the issue with relations loaded
    return this.findOne(projectId, savedIssue.id, userId);
  }

  /** Delete an issue & notify */
  async remove(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<void> {
    const issue = await this.findOne(projectId, issueId, userId);
    const userRole = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );
    if (userRole !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can delete issues');
    }
    await this.issueRepo.remove(issue);
    this.eventEmitter.emit('issue.deleted', {
      projectId,
      issueId,
      actorId: userId,
    });
  }

  async updateStatus(
    projectId: string,
    issueId: string,
    status: string,
    userId: string,
  ): Promise<Issue> {
    const issue = await this.findOne(projectId, issueId, userId);
    // Optionally: check permissions here
    if (!Object.values(IssueStatus).includes(status as IssueStatus)) {
      throw new Error(`Invalid status: ${status}`);
    }
    issue.status = status as IssueStatus;
    return this.issueRepo.save(issue);
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
  ) {}

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
      if (role !== 'ProjectLead')
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
      if (role !== 'ProjectLead')
        throw new ForbiddenException('Cannot edit this work log');
    }
    if (minutesSpent !== undefined) workLog.minutesSpent = minutesSpent;
    if (note !== undefined) workLog.note = note;
    return this.workLogRepo.save(workLog);
  }
}

// src/sprints/sprints.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Sprint } from './entities/sprint.entity';
import { SprintIssue } from './entities/sprint-issue.entity';
import { IssueStatus } from '../issues/entities/issue.entity';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { AddIssueToSprintDto } from './dto/add-issue.dto';
import { RemoveIssueFromSprintDto } from './dto/remove-issue.dto';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { IssuesService } from '../issues/issues.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Issue } from '../issues/entities/issue.entity';
import { SprintStatus } from './entities/sprint.entity';
import { BoardsService } from '../boards/boards.service';
import { BoardType } from '../boards/entities/board.entity';

@Injectable()
export class SprintsService {
  constructor(
    @InjectRepository(Sprint)
    private sprintRepo: Repository<Sprint>,
    @InjectRepository(SprintIssue)
    private siRepo: Repository<SprintIssue>,
    private projectsService: ProjectsService,
    private membersService: ProjectMembersService,
    private issuesService: IssuesService,
    private eventEmitter: EventEmitter2,
    private boardsService: BoardsService,
  ) {}

  /** Create sprint under a project */
  async create(
    projectId: string,
    userId: string,
    dto: CreateSprintDto,
  ): Promise<Sprint> {
    await this.projectsService.findOneById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Not allowed to create sprint');
    }

    // If status is set to ACTIVE, ensure isActive is true
    const sprint = this.sprintRepo.create({ projectId, ...dto });
    if (sprint.status === SprintStatus.ACTIVE) {
      sprint.isActive = true;
    }
    const saved = await this.sprintRepo.save(sprint);

    // Jira-style: Automatically create a board when sprint is created as ACTIVE
    if (saved.status === SprintStatus.ACTIVE) {
      try {
        const existingBoards = await this.boardsService.findAll(
          projectId,
          userId,
        );
        if (existingBoards.length === 0) {
          // Create a default board for the sprint
          await this.boardsService.create(projectId, userId, {
            name: `${saved.name} Board`,
            type: BoardType.KANBAN,
          });
        }
      } catch (error) {
        // Log the error but don't fail the sprint creation
        console.warn('Failed to create board for sprint:', error);
      }
    }

    this.eventEmitter.emit('sprint.event', {
      projectId,
      issueId: null,
      action: `created sprint ${saved.name}`,
      actorId: userId,
      sprintName: saved.name,
    });

    return saved;
  }

  /** List all sprints in a project */
  async findAll(
    projectId: string,
    userId: string,
    active?: string,
  ): Promise<Sprint[]> {
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
    const where: {
      projectId: string;
      isActive?: boolean;
      status?: string;
    } = { projectId };
    if (active) {
      where.isActive = true;
      where.status = 'ACTIVE';
    }
    return this.sprintRepo.find({ where });
  }

  /** Get one sprint */
  async findOne(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<Sprint> {
    const sprint = await this.sprintRepo.findOne({
      where: { id: sprintId, projectId },
      relations: ['issues', 'issues.issue'],
    });
    if (!sprint) throw new NotFoundException('Sprint not found');
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
    return sprint;
  }

  /** Update sprint metadata */
  async update(
    projectId: string,
    sprintId: string,
    userId: string,
    dto: UpdateSprintDto,
  ): Promise<Sprint> {
    const sprint = await this.findOne(projectId, sprintId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can update sprint');
    }
    Object.assign(sprint, dto);
    // If status is set to ACTIVE, ensure isActive is true
    if (sprint.status === SprintStatus.ACTIVE) {
      sprint.isActive = true;
    }
    const updated = await this.sprintRepo.save(sprint);

    // Jira-style: Automatically create a board when sprint is updated to ACTIVE
    if (updated.status === SprintStatus.ACTIVE) {
      try {
        const existingBoards = await this.boardsService.findAll(
          projectId,
          userId,
        );
        if (existingBoards.length === 0) {
          // Create a default board for the sprint
          await this.boardsService.create(projectId, userId, {
            name: `${updated.name} Board`,
            type: BoardType.KANBAN,
          });
        }
      } catch (error) {
        // Log the error but don't fail the sprint update
        console.warn('Failed to create board for sprint:', error);
      }
    }

    this.eventEmitter.emit('sprint.event', {
      projectId,
      issueId: null,
      action: `updated sprint ${updated.name}`,
      actorId: userId,
      sprintName: updated.name,
    });

    return updated;
  }

  /** Close (archive) sprint, Jira-style: move incomplete issues to backlog or next sprint */
  async archive(
    projectId: string,
    sprintId: string,
    userId: string,
    nextSprintId?: string,
  ): Promise<Sprint> {
    const sprint = await this.findOne(projectId, sprintId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can archive sprint');
    }

    // Jira-style: Move incomplete issues to backlog or next sprint
    const sprintIssues = await this.siRepo.find({
      where: { sprintId },
      relations: ['issue'],
    });
    const incompleteSprintIssues = sprintIssues.filter(
      (si) => si.issue.status !== IssueStatus.DONE,
    );
    if (incompleteSprintIssues.length > 0) {
      if (nextSprintId && nextSprintId !== sprintId) {
        // Validate next sprint exists and is active
        const nextSprint = await this.sprintRepo.findOne({
          where: { id: nextSprintId, projectId, isActive: true },
        });
        if (!nextSprint)
          throw new BadRequestException('Next sprint not found or not active');
        // Move each incomplete issue to next sprint
        for (const si of incompleteSprintIssues) {
          si.sprintId = nextSprintId;
          await this.siRepo.save(si);
        }
      } else {
        // Remove from sprint (move to backlog)
        await this.siRepo.remove(incompleteSprintIssues);
      }
    }

    sprint.isActive = false;
    sprint.status = SprintStatus.COMPLETED;
    const archived = await this.sprintRepo.save(sprint);

    this.eventEmitter.emit('sprint.event', {
      projectId,
      issueId: null,
      action: `archived sprint ${archived.name}`,
      actorId: userId,
      sprintName: archived.name,
    });

    return archived;
  }

  /** Delete a sprint */
  async remove(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<void> {
    const sprint = await this.findOne(projectId, sprintId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can delete sprint');
    }
    await this.sprintRepo.remove(sprint);

    this.eventEmitter.emit('sprint.event', {
      projectId,
      issueId: null,
      action: `deleted sprint ${sprint.name}`,
      actorId: userId,
      sprintName: sprint.name,
    });
  }

  /** Add an existing issue to sprint */
  async addIssue(
    projectId: string,
    sprintId: string,
    userId: string,
    dto: AddIssueToSprintDto,
  ): Promise<SprintIssue> {
    const sprint = await this.findOne(projectId, sprintId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can add issues');
    }
    await this.issuesService.findOne(projectId, dto.issueId, userId);

    const si = this.siRepo.create({
      sprintId,
      issueId: dto.issueId,
      sprintOrder: dto.sprintOrder ?? 0,
    });
    const saved = await this.siRepo.save(si);

    this.eventEmitter.emit('sprint.event', {
      projectId,
      issueId: dto.issueId,
      action: `added issue to sprint ${sprint.name}`,
      actorId: userId,
      sprintName: sprint.name,
    });

    return saved;
  }

  /** Remove an issue from sprint */
  async removeIssue(
    projectId: string,
    sprintId: string,
    userId: string,
    dto: RemoveIssueFromSprintDto,
  ): Promise<void> {
    const sprint = await this.findOne(projectId, sprintId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can remove issues');
    }
    const si = await this.siRepo.findOneBy({
      sprintId,
      issueId: dto.issueId,
    });
    if (!si) throw new NotFoundException('Issue not in sprint');
    await this.siRepo.remove(si);

    this.eventEmitter.emit('sprint.event', {
      projectId,
      issueId: dto.issueId,
      action: `removed issue from sprint ${sprint.name}`,
      actorId: userId,
      sprintName: sprint.name,
    });
  }

  async getSprintIssues(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<Issue[]> {
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
    const sprintIssues = await this.siRepo.find({
      where: { sprintId },
      relations: ['issue'],
      order: { sprintOrder: 'ASC' },
    });
    return sprintIssues.map((si) => si.issue);
  }

  async startSprint(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<Sprint> {
    const sprint = await this.findOne(projectId, sprintId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can start sprint');
    }
    sprint.status = SprintStatus.ACTIVE;
    sprint.isActive = true;
    const started = await this.sprintRepo.save(sprint);

    // Jira-style: Automatically create a board when sprint is activated
    try {
      const existingBoards = await this.boardsService.findAll(
        projectId,
        userId,
      );
      if (existingBoards.length === 0) {
        // Create a default board for the sprint
        await this.boardsService.create(projectId, userId, {
          name: `${sprint.name} Board`,
          type: BoardType.KANBAN,
        });
      }
    } catch (error) {
      // Log the error but don't fail the sprint start
      console.warn('Failed to create board for sprint:', error);
    }

    this.eventEmitter.emit('sprint.event', {
      projectId,
      issueId: null,
      action: `started sprint ${started.name}`,
      actorId: userId,
      sprintName: started.name,
    });
    return started;
  }
}

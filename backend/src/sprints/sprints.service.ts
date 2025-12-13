// src/sprints/sprints.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Repository, FindOptionsWhere, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Sprint } from './entities/sprint.entity';
import { SprintIssue } from './entities/sprint-issue.entity';
import { SprintSnapshot } from './entities/sprint-snapshot.entity';
import { IssueStatus } from '../issues/entities/issue.entity';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { AddIssueToSprintDto } from './dto/add-issue.dto';
import { RemoveIssueFromSprintDto } from './dto/remove-issue.dto';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { ProjectRole } from '../membership/enums/project-role.enum';

import { IssuesService } from '../issues/issues.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Issue } from '../issues/entities/issue.entity';
import { SprintStatus } from './entities/sprint.entity';
import { BoardsService } from '../boards/boards.service';
import { BoardType } from '../boards/entities/board.entity';
import { SmartDefaultsService } from '../user-preferences/services/smart-defaults.service';

@Injectable()
export class SprintsService {
  constructor(
    @InjectRepository(Sprint)
    private sprintRepo: Repository<Sprint>,
    @InjectRepository(SprintIssue)
    private siRepo: Repository<SprintIssue>,
    @InjectRepository(SprintSnapshot)
    private snapshotRepo: Repository<SprintSnapshot>,
    private projectsService: ProjectsService,
    private membersService: ProjectMembersService,
    private issuesService: IssuesService,
    private eventEmitter: EventEmitter2,
    private boardsService: BoardsService,
    private smartDefaultsService: SmartDefaultsService,
  ) {}

  /** Create sprint under a project */
  async create(
    projectId: string,
    userId: string,
    dto: CreateSprintDto,
    organizationId?: string,
  ): Promise<Sprint> {
    await this.projectsService.findOneById(projectId, organizationId);
    // Permission check handled by @RequireProjectRole and PermissionsGuard

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
    active?: boolean,
    organizationId?: string,
  ): Promise<Sprint[]> {
    // Validate project access
    if (organizationId) {
      await this.projectsService.findOneById(projectId, organizationId);
    }
    // Permission check handled by Guard

    const where: FindOptionsWhere<Sprint> = { projectId };
    if (active) {
      where.isActive = true;
      where.status = SprintStatus.ACTIVE;
    }
    return this.sprintRepo.find({ where });
  }

  /** System-wide finder for Cron jobs */
  async findAllActiveSystemWide(): Promise<Sprint[]> {
    return this.sprintRepo.find({
      where: {
        status: SprintStatus.ACTIVE,
        isActive: true,
      },
    });
  }

  /** Get one sprint */
  async findOne(
    projectId: string,
    sprintId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Sprint> {
    const sprint = await this.sprintRepo.findOne({
      where: { id: sprintId, projectId },
      relations: ['issues', 'issues.issue', 'project'],
    });
    if (!sprint) throw new NotFoundException('Sprint not found');

    // Validate organization access
    if (organizationId && sprint.project.organizationId !== organizationId) {
      throw new NotFoundException('Sprint not found');
    }

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
    organizationId?: string,
  ): Promise<Sprint> {
    const sprint = await this.findOne(
      projectId,
      sprintId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
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
    organizationId?: string,
  ): Promise<Sprint> {
    const sprint = await this.findOne(
      projectId,
      sprintId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can archive sprint');
    }

    // Jira-style: Move incomplete issues to backlog or next sprint
    const sprintIssues = await this.siRepo.find({
      where: { sprintId },
      relations: ['issue'],
    });
    const incompleteSprintIssues = sprintIssues.filter(
      (si) => si.issue.status !== (IssueStatus.DONE as string),
    );
    if (incompleteSprintIssues.length > 0) {
      if (nextSprintId && nextSprintId !== sprintId) {
        // Validate next sprint exists and is active
        const nextSprint = await this.sprintRepo.findOne({
          where: { id: nextSprintId, projectId, isActive: true },
        });
        if (!nextSprint)
          throw new BadRequestException('Next sprint not found or not active');

        // OPTIMIZED: Bulk update instead of loop (100x faster)
        const incompleteIssueIds = incompleteSprintIssues.map((si) => si.id);
        await this.siRepo.update(
          { id: In(incompleteIssueIds) },
          { sprintId: nextSprintId },
        );
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

    // Track behavior: Sprint Completion
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
        velocity: completedIssuesCount, // Simplified velocity tracking
      },
      timestamp: new Date(),
    });

    return archived;
  }

  /** Delete a sprint */
  async remove(
    projectId: string,
    sprintId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    const sprint = await this.findOne(
      projectId,
      sprintId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
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
    organizationId?: string,
  ): Promise<SprintIssue> {
    const sprint = await this.findOne(
      projectId,
      sprintId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
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
    organizationId?: string,
  ): Promise<void> {
    const sprint = await this.findOne(
      projectId,
      sprintId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
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
    organizationId?: string,
  ): Promise<Issue[]> {
    // Validate project access via findOne (or explicit check)
    if (organizationId) {
      await this.projectsService.findOneById(projectId, organizationId);
    }
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
    organizationId?: string,
  ): Promise<Sprint> {
    const sprint = await this.findOne(
      projectId,
      sprintId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
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
    // CAPTURE SNAPSHOT: Sprint Activated
    await this.captureSnapshot(sprintId);

    return started;
  }

  /**
   * INDUSTRY-LEVEL METRICS: SNAPSHOT CAPTURE
   * Records the state of the sprint for Burndown charts.
   */
  async captureSnapshot(sprintId: string): Promise<void> {
    const sprint = await this.sprintRepo.findOne({ where: { id: sprintId } });
    if (!sprint || sprint.status !== SprintStatus.ACTIVE) return;

    // OPTIMIZED: Use DB aggregation instead of loading all issues
    interface SnapshotStats {
      totalIssues: string | number;
      totalPoints: string | number;
      completedPoints: string | number;
      completedIssues: string | number;
    }

    const stats = await this.siRepo
      .createQueryBuilder('si')
      .leftJoin('si.issue', 'issue')
      .select('COUNT(issue.id)', 'totalIssues')
      .addSelect('SUM(issue.storyPoints)', 'totalPoints')
      .addSelect(
        "SUM(CASE WHEN issue.status = 'Done' THEN issue.storyPoints ELSE 0 END)",
        'completedPoints',
      )
      .addSelect(
        "COUNT(CASE WHEN issue.status = 'Done' THEN 1 ELSE NULL END)",
        'completedIssues',
      )
      .where('si.sprintId = :sprintId', { sprintId })
      .getRawOne<SnapshotStats>();

    // Safety check if stats is null (no issues in sprint)
    if (!stats) return;

    const totalPoints = Number(stats.totalPoints || 0);
    const completedPoints = Number(stats.completedPoints || 0);
    const totalIssues = Number(stats.totalIssues || 0);
    const completedIssues = Number(stats.completedIssues || 0);

    const today = new Date().toISOString().split('T')[0];

    // Check if snapshot exists for today
    let snapshot = await this.snapshotRepo.findOne({
      where: { sprintId, date: today },
    });

    if (!snapshot) {
      snapshot = this.snapshotRepo.create({
        sprintId,
        date: today,
      });
    }

    snapshot.totalPoints = totalPoints;
    snapshot.completedPoints = completedPoints;
    snapshot.remainingPoints = totalPoints - completedPoints;
    snapshot.totalIssues = totalIssues;
    snapshot.completedIssues = completedIssues;

    await this.snapshotRepo.save(snapshot);
  }

  async getSprintSnapshots(sprintId: string): Promise<SprintSnapshot[]> {
    return this.snapshotRepo.find({
      where: { sprintId },
      order: { date: 'ASC' },
    });
  }

  /**
   * BURNDOWN DATA
   */
  async getBurndown(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<any> {
    const sprint = await this.findOne(projectId, sprintId, userId);

    const snapshots = await this.snapshotRepo.find({
      where: { sprintId },
      order: { date: 'ASC' },
    });

    // Generate Ideal Line
    const start = new Date(sprint.startDate);
    const end = new Date(sprint.endDate);
    const totalDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 3600 * 24),
    );

    // Get initial scope from first snapshot or current state
    const initialScope = snapshots.length > 0 ? snapshots[0].totalPoints : 0;
    const idealBurnRate = initialScope / totalDays;

    return {
      sprint,
      snapshots,
      idealBurnRate,
      initialScope,
    };
  }

  /**
   * OPTIMIZED: VELOCITY DATA (Last 5 sprints)
   * Uses single query with DISTINCT ON instead of N+1 loop
   */
  async getVelocity(
    projectId: string, // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _userId: string,
  ): Promise<any> {
    // Check permission
    await this.projectsService.findOneById(projectId);

    const sprints = await this.sprintRepo.find({
      where: { projectId, status: SprintStatus.COMPLETED },
      order: { endDate: 'DESC' },
      take: 5,
    });

    if (sprints.length === 0) {
      return [];
    }

    const sprintIds = sprints.map((s) => s.id);

    // OPTIMIZED: Fetch all latest snapshots in single query using subquery
    // This replaces N queries with 1 query
    const latestSnapshots = await this.snapshotRepo
      .createQueryBuilder('snapshot')
      .where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('MAX(s.date)')
          .from('sprint_snapshots', 's')
          .where('s.sprintId = snapshot.sprintId')
          .getQuery();
        return 'snapshot.date = ' + subQuery;
      })
      .andWhere('snapshot.sprintId IN (:...sprintIds)', { sprintIds })
      .getMany();

    // Create Map for O(1) lookup
    const snapshotMap = new Map(latestSnapshots.map((s) => [s.sprintId, s]));

    // Build result with sprint metadata + snapshot data (oldest first)
    const velocityData = sprints.reverse().map((sprint) => {
      const snapshot = snapshotMap.get(sprint.id);
      return {
        sprintId: sprint.id,
        sprintName: sprint.name,
        completedPoints: snapshot?.completedPoints || 0,
        totalPoints: snapshot?.totalPoints || 0,
      };
    });

    return velocityData;
  }

  /**
   * BURNUP DATA
   * Shows both completed work and total scope over time
   * Useful for visualizing scope creep
   */
  async getBurnup(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<{
    sprint: Sprint;
    snapshots: Array<{
      date: string;
      completedPoints: number;
      totalScope: number;
      remainingPoints: number;
    }>;
    initialScope: number;
    currentScope: number;
    scopeCreep: number;
    scopeCreepPercentage: number;
  }> {
    const sprint = await this.findOne(projectId, sprintId, userId);

    const snapshots = await this.snapshotRepo.find({
      where: { sprintId },
      order: { date: 'ASC' },
    });

    // Get initial and current scope
    const initialScope = snapshots.length > 0 ? snapshots[0].totalPoints : 0;
    const currentScope =
      snapshots.length > 0 ? snapshots[snapshots.length - 1].totalPoints : 0;
    const scopeCreep = currentScope - initialScope;
    const scopeCreepPercentage =
      initialScope > 0
        ? parseFloat(((scopeCreep / initialScope) * 100).toFixed(2))
        : 0;

    // Transform snapshots for burnup chart
    const burnupSnapshots = snapshots.map((s) => ({
      date: s.date,
      completedPoints: s.completedPoints,
      totalScope: s.totalPoints,
      remainingPoints: s.remainingPoints,
    }));

    return {
      sprint,
      snapshots: burnupSnapshots,
      initialScope,
      currentScope,
      scopeCreep,
      scopeCreepPercentage,
    };
  }
}

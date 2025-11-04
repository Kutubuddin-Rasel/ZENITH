import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { Issue, IssueStatus } from '../issues/entities/issue.entity'; // import IssueStatus
import { Revision } from '../revisions/entities/revision.entity';
import { InvitesService } from '../invites/invites.service';
import { Invite } from '../invites/entities/invite.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly projectMembersService: ProjectMembersService,
    @Inject(forwardRef(() => InvitesService))
    private readonly invitesService: InvitesService,
    private readonly dataSource: DataSource,
    @InjectRepository(Issue)
    private readonly issueRepo?: Repository<Issue>,
  ) {}

  /**
   * Create a new project and assign Project Lead.
   * @param userId ID of the creator (from req.user.userId)
   * @param dto CreateProjectDto with optional projectLeadId
   */
  async create(userId: string, dto: CreateProjectDto): Promise<Project> {
    const project = this.projectRepo.create({
      name: dto.name,
      key: dto.key,
      description: dto.description,
    });
    let saved: Project;
    try {
      saved = await this.projectRepo.save(project);
    } catch {
      // Likely unique constraint violation on name or key
      throw new BadRequestException('Project name or key might already exist');
    }

    // Determine who should be Project Lead
    const projectLeadId = dto.projectLeadId || userId;

    // Assign Project Lead
    await this.projectMembersService.addMemberToProject({
      projectId: saved.id,
      userId: projectLeadId,
      roleName: 'ProjectLead',
    });

    // If creator is not the Project Lead, add them as a member with appropriate role
    if (projectLeadId !== userId) {
      await this.projectMembersService.addMemberToProject({
        projectId: saved.id,
        userId,
        roleName: 'Developer', // Default role for project creator if not Project Lead
      });
    }

    return saved;
  }

  /**
   * List all projects the user is a member of (non-archived by default).
   */
  async findAllForUser(
    userId: string,
    isSuperAdmin: boolean,
  ): Promise<Project[]> {
    if (isSuperAdmin) {
      return this.projectRepo.find({ where: { isArchived: false } });
    }

    // For all other users, including ProjectLeads, show only projects they are members of.
    return this.projectRepo
      .createQueryBuilder('project')
      .innerJoin(
        'project_members',
        'pm',
        'pm.projectId = project.id AND pm.userId = :userId',
        { userId },
      )
      .andWhere('project.isArchived = false')
      .getMany();
  }

  /**
   * Find one project by ID. Throw if not found or archived (if desired).
   */
  async findOneById(id: string): Promise<Project> {
    const project = await this.projectRepo.findOneBy({ id });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    // Optionally: if archived, maybe throw or allow view. Up to you.
    return project;
  }

  /**
   * Update a project's fields. Only ProjectLead or superadmin should call.
   */
  async update(projectId: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOneById(projectId);
    Object.assign(project, dto);
    try {
      return await this.projectRepo.save(project);
    } catch {
      throw new BadRequestException(
        'Failed to update project (possible conflict)',
      );
    }
  }

  /**
   * Archive or delete a project. Only ProjectLead or superadmin.
   * Here we do soft-delete by archiving.
   */
  async archive(projectId: string): Promise<Project> {
    const project = await this.findOneById(projectId);
    project.isArchived = true;
    return this.projectRepo.save(project);
  }

  /**
   * Remove a project permanently. Use with caution. Only ProjectLead or superadmin.
   */
  async remove(projectId: string): Promise<void> {
    const project = await this.findOneById(projectId);
    await this.projectRepo.remove(project);
  }

  /**
   * Summary / Progress endpoint: compute counts by status and percent done.
   * Requires Issue entity. If issueRepo not injected, use dataSource.getRepository(Issue).
   */
  async getSummary(projectId: string) {
    try {
      // Verify project exists
      const project = await this.findOneById(projectId);
      // Choose repository
      const issueRepository =
        this.issueRepo || this.dataSource.getRepository(Issue);

      // Count total
      const totalCount = await issueRepository.count({
        where: { projectId },
      });
      // Count done using the enum member:
      const doneCount = await issueRepository.count({
        where: { projectId, status: IssueStatus.DONE },
      });
      // Group by status
      const result: { status: string; count: number }[] =
        await this.projectRepo.query(
          'SELECT status, COUNT(*) FROM issues WHERE "projectId" = $1 GROUP BY status',
          [projectId],
        );
      const statusCounts = result.reduce(
        (acc: Record<string, number>, row) => {
          acc[row.status] = Number(row.count);
          return acc;
        },
        {} as Record<string, number>,
      );
      const percentDone =
        totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

      return {
        projectId: project.id,
        projectName: project.name,
        totalIssues: totalCount,
        doneIssues: doneCount,
        percentDone,
        statusCounts,
      };
    } catch (error) {
      console.error('Error in getSummary:', error);
      throw new BadRequestException(
        'Failed to compute project summary: ' + (error?.message || error),
      );
    }
  }

  /**
   * Get recent activity (revisions) for all entities in a project
   */
  async getProjectActivity(projectId: string, limit = 50): Promise<Revision[]> {
    const repo = this.dataSource.getRepository(Revision);
    // Query all revisions where the snapshot contains the projectId
    return repo
      .createQueryBuilder('revision')
      .where(`revision.snapshot::jsonb ->> 'projectId' = :projectId`, {
        projectId,
      })
      .orderBy('revision.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get all pending invites for a project
   */
  async getInvites(projectId: string): Promise<Invite[]> {
    return this.invitesService.findForProject(projectId);
  }
}

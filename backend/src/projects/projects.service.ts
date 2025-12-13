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
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { Issue, IssueStatus } from '../issues/entities/issue.entity'; // import IssueStatus
import { Revision } from '../revisions/entities/revision.entity';
import { InvitesService } from '../invites/invites.service';
import { Invite } from '../invites/entities/invite.entity';

import { CacheService } from '../cache/cache.service';
import { validateOrganizationAccess } from '../common/utils/org-access.util';
import { AuditLogsService } from '../audit/audit-logs.service';

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
    private readonly issueRepo: Repository<Issue>,
    private readonly cacheService: CacheService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Create a new project and assign Project Lead.
   * @param userId ID of the creator (from req.user.userId)
   * @param dto CreateProjectDto with optional projectLeadId
   * @param organizationId ID of the organization (from user's context)
   */
  async create(
    userId: string,
    dto: CreateProjectDto,
    organizationId?: string,
  ): Promise<Project> {
    const project = this.projectRepo.create({
      name: dto.name,
      key: dto.key,
      description: dto.description,
      organizationId, // Auto-assign organization
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
      roleName: ProjectRole.PROJECT_LEAD,
    });

    // If creator is not the Project Lead, add them as a member with appropriate role
    if (projectLeadId !== userId) {
      await this.projectMembersService.addMemberToProject({
        projectId: saved.id,
        userId,
        roleName: ProjectRole.MEMBER, // Default role for project creator if not Project Lead
      });
    }

    return saved;
  }

  /**
   * List all projects the user is a member of (non-archived by default).
   * For organization-scoped access, filter by organizationId.
   */
  async findAllForUser(
    userId: string,
    isSuperAdmin: boolean,
    organizationId?: string,
  ): Promise<Project[]> {
    // Super admins see all projects in their organization
    if (isSuperAdmin && organizationId) {
      return this.projectRepo.find({
        where: {
          isArchived: false,
          organizationId,
        },
      });
    }

    // For all other users, including ProjectLeads, show only projects they are members of.
    // CRITICAL: Strictly filter by organizationId to prevent data leakage between workspaces.
    const query = this.projectRepo
      .createQueryBuilder('project')
      .innerJoin(
        'project_members',
        'pm',
        'pm.projectId = project.id AND pm.userId = :userId',
        { userId },
      )
      .andWhere('project.isArchived = false');

    // Filter by organization if provided (should always be provided for multi-tenant isolation)
    if (organizationId) {
      query.andWhere('project.organizationId = :organizationId', {
        organizationId,
      });
    } else {
      // Fallback: If no organizationId is provided, return empty list to be safe
      // or throw an error depending on strictness requirements.
      // For now, returning empty list prevents leakage.
      return [];
    }

    return query.getMany();
  }

  /**
   * Find one project by ID with organization validation.
   * @param id Project ID
   * @param organizationId Optional organization ID for access control
   */
  async findOneById(id: string, organizationId?: string): Promise<Project> {
    // Try cache first
    const cachedProject = (await this.cacheService.getCachedProject(
      id,
    )) as Project | null;
    if (cachedProject) {
      // If organizationId is provided, validate it against cached project
      validateOrganizationAccess(cachedProject, organizationId, 'Project');
      return cachedProject;
    }

    const project = await this.projectRepo.findOneBy({ id });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Validate organization access
    validateOrganizationAccess(project, organizationId, 'Project');

    // Cache the project
    await this.cacheService.cacheProject(id, project);

    return project;
  }

  /**
   * Find one project by Key with organization validation.
   */
  async findByKey(
    key: string,
    organizationId?: string,
  ): Promise<Project | null> {
    const project = await this.projectRepo.findOneBy({ key });
    if (!project) return null;

    try {
      validateOrganizationAccess(project, organizationId);
    } catch {
      return null;
    }

    return project;
  }

  /**
   * Update a project's fields with organization validation.
   * @param projectId Project ID
   * @param dto Update data
   * @param organizationId Optional organization ID for access control
   */
  async update(
    projectId: string,
    dto: UpdateProjectDto,
    organizationId?: string,
  ): Promise<Project> {
    const project = await this.findOneById(projectId, organizationId);
    Object.assign(project, dto);
    try {
      const saved = await this.projectRepo.save(project);
      // Invalidate cache
      await this.cacheService.invalidateProjectCache(projectId);
      return saved;
    } catch {
      throw new BadRequestException(
        'Failed to update project (possible conflict)',
      );
    }
  }

  /**
   * Archive a project with organization validation.
   * @param projectId Project ID
   * @param organizationId Optional organization ID for access control
   */
  async archive(projectId: string, organizationId?: string): Promise<Project> {
    const project = await this.findOneById(projectId, organizationId);
    project.isArchived = true;
    const saved = await this.projectRepo.save(project);
    // Invalidate cache
    await this.cacheService.invalidateProjectCache(projectId);
    return saved;
  }

  /**
   * Remove a project permanently with organization validation.
   * @param projectId Project ID
   * @param organizationId Optional organization ID for access control
   */
  async remove(projectId: string, organizationId?: string): Promise<void> {
    const project = await this.findOneById(projectId, organizationId);
    await this.projectRepo.remove(project);
    // Invalidate cache
    await this.cacheService.invalidateProjectCache(projectId);
  }

  /**
   * OPTIMIZED: Summary / Progress endpoint with caching
   * Caches for 5 minutes to avoid repeated expensive aggregation queries
   */
  async getSummary(projectId: string) {
    // Check cache first
    const cacheKey = `project:${projectId}:summary`;
    const cached = await this.cacheService.get<{
      projectId: string;
      projectName: string;
      totalIssues: number;
      doneIssues: number;
      percentDone: number;
      statusCounts: Record<string, number>;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

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

      const summary = {
        projectId: project.id,
        projectName: project.name,
        totalIssues: totalCount,
        doneIssues: doneCount,
        percentDone,
        statusCounts,
      };

      // Cache for 5 minutes
      await this.cacheService.set(cacheKey, summary, {
        ttl: 300,
        tags: [`project:${projectId}`],
      });

      return summary;
    } catch (error) {
      console.error('Error in getSummary:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        'Failed to compute project summary: ' + errorMessage,
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

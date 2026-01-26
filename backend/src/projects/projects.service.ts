import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Optional,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectAccessSettings } from './entities/project-access-settings.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectAccessSettingsDto } from './dto/update-project-access-settings.dto';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { Issue, IssueStatus } from '../issues/entities/issue.entity';
import { Revision } from '../revisions/entities/revision.entity';
import { InvitesService } from '../invites/invites.service';
import { Invite } from '../invites/entities/invite.entity';

import { CacheService } from '../cache/cache.service';
import { AuditLogsService } from '../audit/audit-logs.service';
import { ProjectTemplate } from '../project-templates/entities/project-template.entity';
import { TemplateApplicationService } from '../project-templates/services/template-application.service';
// TENANT ISOLATION: Import tenant repository factory
import {
  TenantRepositoryFactory,
  TenantRepository,
  TenantContext,
} from '../core/tenant';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ProjectsService implements OnModuleInit {
  private readonly logger = new Logger(ProjectsService.name);

  // TENANT ISOLATION: Tenant-aware repository wrapper
  private tenantProjectRepo!: TenantRepository<Project>;

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly projectMembersService: ProjectMembersService,
    @Inject(forwardRef(() => InvitesService))
    private readonly invitesService: InvitesService,
    private readonly dataSource: DataSource,
    @InjectRepository(Issue)
    private readonly issueRepo: Repository<Issue>,
    @InjectRepository(ProjectAccessSettings)
    private readonly accessSettingsRepo: Repository<ProjectAccessSettings>,
    private readonly cacheService: CacheService,
    private readonly auditLogsService: AuditLogsService,
    @Optional()
    @InjectRepository(ProjectTemplate)
    private readonly templateRepo?: Repository<ProjectTemplate>,
    @Optional()
    @Inject(forwardRef(() => TemplateApplicationService))
    private readonly templateApplicationService?: TemplateApplicationService,
    // TENANT ISOLATION: Inject factory and context
    private readonly tenantRepoFactory?: TenantRepositoryFactory,
    private readonly tenantContext?: TenantContext,
    private readonly cls?: ClsService,
  ) {}

  /**
   * OnModuleInit: Create tenant-aware repository wrappers
   */
  onModuleInit() {
    if (this.tenantRepoFactory) {
      this.tenantProjectRepo = this.tenantRepoFactory.create(this.projectRepo);
    }
  }

  /**
   * Create a new project and assign Project Lead.
   * @param userId ID of the creator (from req.user.userId)
   * @param dto CreateProjectDto with optional projectLeadId and templateId
   */
  async create(userId: string, dto: CreateProjectDto): Promise<Project> {
    // TENANT ISOLATION: Get organizationId from context
    const organizationId = this.tenantContext?.getTenantId();

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

    // Apply template configuration if templateId is provided
    if (dto.templateId) {
      // Use unified TemplateApplicationService if available
      if (this.templateApplicationService) {
        try {
          await this.templateApplicationService.applyTemplate(
            saved.id,
            dto.templateId,
            userId,
          );
          this.logger.log(
            `Applied template ${dto.templateId} to project ${saved.id}`,
          );
        } catch (error) {
          this.logger.warn(`Failed to apply template ${dto.templateId}`, error);
        }
      } else if (this.templateRepo) {
        // Fallback to local method if service unavailable
        try {
          await this.applyTemplateToProject(saved.id, dto.templateId, userId);
        } catch (error) {
          this.logger.warn(`Failed to apply template ${dto.templateId}`, error);
        }
      }
    }

    return saved;
  }

  /**
   * Apply template configuration to a project
   * Called when a templateId is provided during project creation
   */

  private async applyTemplateToProject(
    projectId: string,
    templateId: string,
    _userId: string,
  ): Promise<void> {
    void _userId; // Unused but kept for future use
    if (!this.templateRepo) {
      this.logger.warn(
        'Template repository not available, skipping template application',
      );
      return;
    }

    const template = await this.templateRepo.findOne({
      where: { id: templateId, isActive: true },
    });

    if (!template) {
      this.logger.warn(
        `Template ${templateId} not found or inactive, skipping`,
      );
      return;
    }

    this.logger.log(
      `Applying template "${template.name}" to project ${projectId}`,
    );

    // Update project with template metadata
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    if (project) {
      // Store template config on the project for reference
      project.templateConfig = {
        defaultSprintDuration:
          template.templateConfig?.defaultSprintDuration || 14,
        defaultIssueTypes: template.templateConfig?.defaultIssueTypes || [],
        defaultPriorities: template.templateConfig?.defaultPriorities || [
          'Low',
          'Medium',
          'High',
          'Critical',
        ],
        defaultStatuses: template.templateConfig?.defaultStatuses || [],
        suggestedRoles:
          template.templateConfig?.suggestedRoles?.map((r) => ({
            role: r.role,
            description: r.description,
          })) || [],
        smartDefaults: template.templateConfig?.smartDefaults || {
          enableTimeTracking: false,
          enableStoryPoints: false,
          defaultStoryPointScale: [1, 2, 3, 5, 8, 13],
        },
      };
      await this.projectRepo.save(project);
    }

    // Increment template usage count
    template.usageCount = (template.usageCount || 0) + 1;
    await this.templateRepo.save(template);

    this.logger.log(
      `Template "${template.name}" applied to project ${projectId}`,
    );
  }

  /**
   * List all projects the user is a member of (non-archived by default).
   * TENANT ISOLATION: Automatically filtered by current tenant context.
   */
  async findAllForUser(
    userId: string,
    isSuperAdmin: boolean,
  ): Promise<Project[]> {
    // Get organizationId from context
    const organizationId = this.tenantContext?.getTenantId();

    // Super admins see all projects in their organization
    if (isSuperAdmin && organizationId && this.tenantProjectRepo) {
      return this.tenantProjectRepo.find({
        where: { isArchived: false },
      });
    }

    // For all other users, show only projects they are members of.
    // TENANT ISOLATION: tenantProjectRepo auto-filters by organizationId
    const query = this.projectRepo
      .createQueryBuilder('project')
      .innerJoin(
        'project_members',
        'pm',
        'pm.projectId = project.id AND pm.userId = :userId',
        { userId },
      )
      .andWhere('project.isArchived = false');

    // TENANT ISOLATION: Filter by organization from context
    if (organizationId) {
      query.andWhere('project.organizationId = :organizationId', {
        organizationId,
      });
    } else {
      // Safety: return empty if no org context (prevents data leakage)
      return [];
    }

    return query.getMany();
  }

  /**
   * Find one project by ID.
   * TENANT ISOLATION: Automatically validated by TenantRepository.
   */
  async findOneById(id: string): Promise<Project> {
    // Try cache first
    const cachedProject = (await this.cacheService.getCachedProject(
      id,
    )) as Project | null;

    if (cachedProject) {
      // Validate tenant access via context
      const currentTenantId = this.tenantContext?.getTenantId();
      if (currentTenantId && cachedProject.organizationId !== currentTenantId) {
        throw new NotFoundException('Project not found');
      }
      return cachedProject;
    }

    // TENANT ISOLATION: Use tenant-aware repository if available
    let project: Project | null;
    if (this.tenantProjectRepo) {
      project = await this.tenantProjectRepo.findOne({ where: { id } });
    } else {
      project = await this.projectRepo.findOneBy({ id });
    }

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Cache the project (type assertion: JSON serialization converts Date -> string)
    await this.cacheService.cacheProject(
      id,
      project as unknown as import('../cache/cache.interfaces').CachedProject,
    );

    return project;
  }

  /**
   * Find one project by Key.
   * TENANT ISOLATION: Uses tenant-aware repository for automatic filtering.
   */
  async findByKey(key: string): Promise<Project | null> {
    // TENANT ISOLATION: Use tenant-aware repository if available
    if (this.tenantProjectRepo) {
      return this.tenantProjectRepo.findOne({ where: { key } });
    }
    return this.projectRepo.findOneBy({ key });
  }

  /**
   * Update a project's fields with organization validation.
   * @param projectId Project ID
   * @param dto Update data
   * @param organizationId Optional organization ID for access control
   */
  async update(projectId: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOneById(projectId);
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
  async archive(projectId: string): Promise<Project> {
    const project = await this.findOneById(projectId);
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
  async remove(projectId: string): Promise<void> {
    const project = await this.findOneById(projectId);
    const projectName = project.name;
    const organizationId = project.organizationId;

    await this.projectRepo.remove(project);

    // Audit: PROJECT_DELETED (Severity: HIGH)
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: organizationId || 'unknown',
      actor_id: this.cls?.get<string>('userId') || 'system',
      projectId,
      resource_type: 'Project',
      resource_id: projectId,
      action_type: 'DELETE',
      action: 'PROJECT_DELETED',
      metadata: {
        severity: 'HIGH',
        projectName,
        requestId: this.cls?.get<string>('requestId'),
      },
    });

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

  /**
   * Get access control settings for a project
   * Creates default settings if none exist
   */
  async getAccessSettings(projectId: string): Promise<ProjectAccessSettings> {
    // Verify project exists (also validates tenant access)
    await this.findOneById(projectId);

    let settings = await this.accessSettingsRepo.findOne({
      where: { projectId },
    });

    // Create default settings if none exist
    if (!settings) {
      settings = this.accessSettingsRepo.create({ projectId });
      settings = await this.accessSettingsRepo.save(settings);
    }

    return settings;
  }

  /**
   * Update access control settings for a project
   */
  async updateAccessSettings(
    projectId: string,
    dto: UpdateProjectAccessSettingsDto,
  ): Promise<ProjectAccessSettings> {
    // Get existing settings (or create defaults)
    const settings = await this.getAccessSettings(projectId);

    // Apply updates
    Object.assign(settings, dto);

    const saved = await this.accessSettingsRepo.save(settings);

    // Log the update for audit
    this.logger.log(
      `Access settings updated for project ${projectId}: ${JSON.stringify(dto)}`,
    );

    return saved;
  }
}

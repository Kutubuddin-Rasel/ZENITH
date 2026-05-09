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
import { IssueStatus } from '../issues/entities/issue.entity';
import { Revision } from '../revisions/entities/revision.entity';

// SOLID Refactor (Step 3): Depend on abstract repository tokens (DIP).
import { IssueRepository } from '../database/repositories/issue.repository';
import { ProjectRepository } from '../database/repositories/project.repository';
import { InvitesService } from '../invites/invites.service';
import { Invite } from '../invites/entities/invite.entity';

import { CACHE_STORE_TOKEN, ENTITY_CACHE_TOKEN } from '../cache/constants/cache.tokens';
import { ICacheStore, IEntityCache } from '../cache/interfaces/cache.interfaces';
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
    // TENANT ISOLATION: Concrete `Repository<Project>` is retained ONLY for
    // wrapping with `TenantRepositoryFactory.create(...)`. All non-tenant
    // project lookups go through the abstract `projects` token below (DIP).
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly projects: ProjectRepository,
    private readonly issues: IssueRepository,
    private readonly projectMembersService: ProjectMembersService,
    @Inject(forwardRef(() => InvitesService))
    private readonly invitesService: InvitesService,
    private readonly dataSource: DataSource,
    @InjectRepository(ProjectAccessSettings)
    private readonly accessSettingsRepo: Repository<ProjectAccessSettings>,
    @Inject(ENTITY_CACHE_TOKEN) private readonly entityCache: IEntityCache,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
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

    const project = this.projects.create({
      name: dto.name,
      key: dto.key,
      description: dto.description,
      organizationId, // Auto-assign organization
    });
    let saved: Project;
    try {
      saved = await this.projects.save(project);
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

    // Audit: PROJECT_CREATED (Severity: MEDIUM)
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: organizationId || 'unknown',
      actor_id: userId,
      projectId: saved.id,
      resource_type: 'Project',
      resource_id: saved.id,
      action_type: 'CREATE',
      action: 'PROJECT_CREATED',
      metadata: {
        severity: 'MEDIUM',
        projectName: saved.name,
        projectKey: saved.key,
        templateId: dto.templateId,
        projectLeadId: projectLeadId,
        requestId: this.cls?.get<string>('requestId'),
      },
    });

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
    const project = await this.projects.findById(projectId);
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
      await this.projects.save(project);
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

    // For all other users, show only projects they are members of, scoped to
    // the current organization. The project_members join is encapsulated in
    // the abstract repo (`findForMember`).
    if (!organizationId) {
      // Safety: return empty if no org context (prevents data leakage)
      return [];
    }
    return this.projects.findForMember(userId, organizationId);
  }

  /**
   * Find one project by ID.
   * TENANT ISOLATION: Automatically validated by TenantRepository.
   */
  async findOneById(id: string): Promise<Project> {
    // Try cache first
    const cachedProject = (await this.entityCache.getCachedProject(
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

    // TENANT ISOLATION: Use tenant-aware repository if available;
    // otherwise fall back to the abstract Project repository (DIP).
    let project: Project | null;
    if (this.tenantProjectRepo) {
      project = await this.tenantProjectRepo.findOne({ where: { id } });
    } else {
      project = await this.projects.findById(id);
    }

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Cache the project (type assertion: JSON serialization converts Date -> string)
    await this.entityCache.cacheProject(
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
    // TENANT ISOLATION: Use tenant-aware repository if available; otherwise
    // route through the abstract Project repository (DIP).
    if (this.tenantProjectRepo) {
      return this.tenantProjectRepo.findOne({ where: { key } });
    }
    return this.projects.findByKey(key);
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
      const saved = await this.projects.save(project);
      // Invalidate cache
      await this.entityCache.invalidateProjectCache(projectId);

      // Audit: PROJECT_UPDATED (Severity: LOW)
      const fieldsChanged = Object.keys(dto);
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: saved.organizationId || 'unknown',
        actor_id: this.cls?.get<string>('userId') || 'system',
        projectId,
        resource_type: 'Project',
        resource_id: projectId,
        action_type: 'UPDATE',
        action: 'PROJECT_UPDATED',
        metadata: {
          severity: 'LOW',
          projectName: saved.name,
          fieldsChanged,
          requestId: this.cls?.get<string>('requestId'),
        },
      });

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
    const saved = await this.projects.save(project);
    // Invalidate cache
    await this.entityCache.invalidateProjectCache(projectId);
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

    await this.projects.remove(project);

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
    await this.entityCache.invalidateProjectCache(projectId);
  }

  /**
   * OPTIMIZED: Summary / Progress endpoint with caching
   * Caches for 5 minutes to avoid repeated expensive aggregation queries
   */
  async getSummary(projectId: string) {
    // Check cache first
    const cacheKey = `project:${projectId}:summary`;
    const cached = await this.cacheStore.get<{
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

      // Count total / done via abstract repo (DIP).
      const totalCount = await this.issues.count({ projectId });
      const doneCount = await this.issues.count({
        projectId,
        status: IssueStatus.DONE,
      });
      // Status histogram is encapsulated in the repository (raw query lives
      // inside the concrete TypeOrm impl, not here).
      const result = await this.issues.countByStatusForProject(projectId);
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
      await this.cacheStore.set(cacheKey, summary, {
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
   *
   * TODO (SOLID Refactor): Revision is not a Tier-1 aggregate yet — this
   * direct DataSource access + JSONB query is intentionally left in place.
   * When Revision is promoted to Tier-1 it will gain a `RevisionRepository`
   * abstract token with a `findByProjectId(projectId, limit)` method.
   */
  async getProjectActivity(projectId: string, limit = 50): Promise<Revision[]> {
    const repo = this.dataSource.getRepository(Revision);
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

    // Capture organization context before update
    const project = await this.findOneById(projectId);

    // Apply updates
    Object.assign(settings, dto);

    const saved = await this.accessSettingsRepo.save(settings);

    // Audit: ACCESS_SETTINGS_UPDATED (Severity: HIGH)
    const changedSettings = Object.keys(dto);
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: project.organizationId || 'unknown',
      actor_id: this.cls?.get<string>('userId') || 'system',
      projectId,
      resource_type: 'ProjectAccessSettings',
      resource_id: saved.id,
      action_type: 'UPDATE',
      action: 'ACCESS_SETTINGS_UPDATED',
      metadata: {
        severity: 'HIGH',
        projectName: project.name,
        changedSettings,
        newValues: dto as Record<string, unknown>,
        requestId: this.cls?.get<string>('requestId'),
      },
    });

    return saved;
  }
}

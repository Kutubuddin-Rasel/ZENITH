import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';

import { ENTITY_CACHE_TOKEN } from '../../cache/constants/cache.tokens';
import type { IEntityCache } from '../../cache/interfaces/cache.interfaces';
import { ProjectRepository } from '../../database/repositories/project.repository';
import {
  TENANT_CONTEXT_READER_TOKEN,
  type ITenantContextReader,
} from '../../core/tenant';
import { PROJECT_MEMBER_COMMAND_TOKEN } from '../../membership/constants/membership.tokens';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import type { IProjectMemberCommand } from '../../membership/interfaces/membership.interfaces';

import {
  AUDIT_LOG_WRITER_TOKEN,
  PROJECT_QUERY_TOKEN,
} from '../constants/projects.tokens';
import { Project } from '../entities/project.entity';
import type {
  CreateProjectCommand,
  IAuditLogWriter,
  IProjectCommand,
  IProjectQuery,
  ProjectSummary,
  UpdateProjectCommand,
} from '../interfaces/projects.interfaces';
import { TemplateApplicationPort } from '../ports/template-application.port';

/**
 * ProjectCommandService
 *
 * Write-side surface of the projects aggregate. Bound to
 * `PROJECT_COMMAND_TOKEN`. Owns every mutation against `Project` rows
 * and the cross-aggregate writes that must succeed alongside them
 * (lead-owner membership, optional template seeding).
 *
 * Transactional contract for `create()`
 * -------------------------------------
 * Steps 1–4 below execute inside a single
 * `dataSource.transaction(async manager => …)` block. If ANY step
 * throws, the entire transaction rolls back — no orphan projects, no
 * half-applied templates, no dangling lead-owner row.
 *
 *  1. `manager.save(Project, …)`                      — project row.
 *  2. `membersCommand.addMember(…, manager)`          — lead-owner.
 *  3. `membersCommand.addMember(…, manager)` (opt.)   — creator-as-member
 *                                                       when lead ≠ creator.
 *  4. `templateApp.applyTemplate(…, manager)`         — template seed.
 *
 * Step 5 — audit logging — fires AFTER commit. It is fire-and-forget
 * (BullMQ enqueue), so a failed audit MUST NOT roll back the project.
 * Cache writes also run post-commit because pre-commit cache
 * population would risk publishing rows that don't yet exist.
 *
 * Cycle break
 * -----------
 * The template application is reached through `TemplateApplicationPort`
 * (bound inside `ProjectTemplatesModule`). The legacy
 * `forwardRef(() => TemplateApplicationService)` is gone. When the
 * port is unbound (e.g. test contexts without the templates module)
 * `templateApp` is undefined and the template step is skipped
 * silently — `templateId` is opt-in on the command.
 *
 * DTO surface
 * -----------
 * Returns `ProjectSummary` exclusively; the TypeORM `Project` entity
 * stays internal. The HTTP controller maps to JSON via the DTO so the
 * frontend never observes ORM metadata.
 */
@Injectable()
export class ProjectCommandService implements IProjectCommand {
  private readonly logger = new Logger(ProjectCommandService.name);

  constructor(
    private readonly projects: ProjectRepository,
    @Inject(PROJECT_QUERY_TOKEN)
    private readonly projectQuery: IProjectQuery,
    @Inject(PROJECT_MEMBER_COMMAND_TOKEN)
    private readonly membersCommand: IProjectMemberCommand,
    @Inject(ENTITY_CACHE_TOKEN)
    private readonly entityCache: IEntityCache,
    @Inject(AUDIT_LOG_WRITER_TOKEN)
    private readonly auditWriter: IAuditLogWriter,
    private readonly dataSource: DataSource,
    private readonly cls: ClsService,
    @Optional()
    @Inject(TENANT_CONTEXT_READER_TOKEN)
    private readonly tenantContext?: ITenantContextReader,
    @Optional()
    private readonly templateApp?: TemplateApplicationPort,
  ) {}

  // ---------------------------------------------------------------------------
  // create — transactional
  // ---------------------------------------------------------------------------

  async create(command: CreateProjectCommand): Promise<ProjectSummary> {
    const organizationId = this.tenantContext?.getTenantId();
    const leadUserId = command.leadUserId ?? command.actorUserId;

    let saved: Project;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const draft = manager.create(Project, {
          name: command.name,
          key: command.key,
          description: command.description,
          organizationId,
        });
        const persisted = await manager.save(Project, draft);

        await this.membersCommand.addMember(
          {
            projectId: persisted.id,
            userId: leadUserId,
            roleName: ProjectRole.PROJECT_LEAD,
          },
          manager,
        );

        if (leadUserId !== command.actorUserId) {
          await this.membersCommand.addMember(
            {
              projectId: persisted.id,
              userId: command.actorUserId,
              roleName: ProjectRole.MEMBER,
            },
            manager,
          );
        }

        if (command.templateId && this.templateApp) {
          await this.templateApp.applyTemplate(
            persisted.id,
            command.templateId,
            command.actorUserId,
            manager,
          );
        }

        return persisted;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new BadRequestException(
          'Project name or key might already exist',
        );
      }
      this.logger.error(
        `Project creation failed for "${command.key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }

    await this.auditWriter.log({
      tenantId: organizationId ?? 'unknown',
      actorId: command.actorUserId,
      resourceType: 'Project',
      resourceId: saved.id,
      actionType: 'CREATE',
      action: 'PROJECT_CREATED',
      projectId: saved.id,
      severity: 'MEDIUM',
      metadata: {
        projectName: saved.name,
        projectKey: saved.key,
        templateId: command.templateId,
        projectLeadId: leadUserId,
      },
    });

    return this.toSummary(saved);
  }

  // ---------------------------------------------------------------------------
  // update / archive / remove
  // ---------------------------------------------------------------------------

  async update(
    projectId: string,
    patch: UpdateProjectCommand,
  ): Promise<ProjectSummary> {
    const summary = await this.projectQuery.findById(projectId);
    const entity = await this.projects.findById(projectId);
    if (!entity) {
      throw new NotFoundException('Project not found');
    }

    if (patch.name !== undefined) {
      entity.name = patch.name;
    }
    if (patch.description !== undefined) {
      entity.description = patch.description;
    }

    let saved: Project;
    try {
      saved = await this.projects.save(entity);
    } catch {
      throw new BadRequestException(
        'Failed to update project (possible conflict)',
      );
    }

    await this.entityCache.invalidateProjectCache(projectId);

    await this.auditWriter.log({
      tenantId: summary.organizationId ?? 'unknown',
      actorId: this.safeClsGet('userId') ?? 'system',
      resourceType: 'Project',
      resourceId: projectId,
      actionType: 'UPDATE',
      action: 'PROJECT_UPDATED',
      projectId,
      severity: 'LOW',
      metadata: {
        projectName: saved.name,
        fieldsChanged: Object.keys(patch),
      },
    });

    return this.toSummary(saved);
  }

  async archive(projectId: string): Promise<ProjectSummary> {
    const entity = await this.projects.findById(projectId);
    if (!entity) {
      throw new NotFoundException('Project not found');
    }
    entity.isArchived = true;
    const saved = await this.projects.save(entity);
    await this.entityCache.invalidateProjectCache(projectId);
    return this.toSummary(saved);
  }

  async remove(projectId: string): Promise<void> {
    const summary = await this.projectQuery.findById(projectId);
    const entity = await this.projects.findById(projectId);
    if (!entity) {
      throw new NotFoundException('Project not found');
    }

    await this.projects.remove(entity);

    await this.auditWriter.log({
      tenantId: summary.organizationId ?? 'unknown',
      actorId: this.safeClsGet('userId') ?? 'system',
      resourceType: 'Project',
      resourceId: projectId,
      actionType: 'DELETE',
      action: 'PROJECT_DELETED',
      projectId,
      severity: 'HIGH',
      metadata: {
        projectName: summary.name,
      },
    });

    await this.entityCache.invalidateProjectCache(projectId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toSummary(project: Project): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      key: project.key,
      description: project.description ?? null,
      templateId: project.templateId ?? null,
      isArchived: project.isArchived,
      organizationId: project.organizationId ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const driverError = error as {
      code?: string;
      driverError?: { code?: string };
    };
    if (driverError.code === '23505') {
      return true;
    }
    if (driverError.driverError?.code === '23505') {
      return true;
    }
    return false;
  }

  private safeClsGet(key: string): string | undefined {
    try {
      const value = this.cls.get<string>(key);
      return value || undefined;
    } catch {
      return undefined;
    }
  }
}

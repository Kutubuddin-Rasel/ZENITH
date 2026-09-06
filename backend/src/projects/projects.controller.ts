import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRoleGuard } from '../auth/guards/project-role.guard';
import { RequireProjectRole } from '../auth/decorators/require-project-role.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { RequireCsrf, StatefulCsrfGuard } from '../security/csrf';
import { UsersService } from '../users/users.service';
import { WorkflowStatusesService } from '../workflows/services/workflow-statuses.service';
import { INVITE_QUERY_TOKEN } from '../invites/constants/invites.tokens';
import type { IInviteQuery } from '../invites/interfaces/invites.interfaces';

import {
  PROJECT_ACCESS_COMMAND_TOKEN,
  PROJECT_ACCESS_QUERY_TOKEN,
  PROJECT_COMMAND_TOKEN,
  PROJECT_METRICS_TOKEN,
  PROJECT_QUERY_TOKEN,
} from './constants/projects.tokens';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectAccessSettingsDto } from './dto/update-project-access-settings.dto';
import type {
  IProjectAccessCommand,
  IProjectAccessQuery,
  IProjectCommand,
  IProjectMetrics,
  IProjectQuery,
} from './interfaces/projects.interfaces';

/**
 * ProjectsController
 *
 * Thin HTTP edge over the projects ISP surface. Every dependency is
 * an abstract token — no concrete service classes injected. Mapping
 * decisions:
 *
 *  - Read paths       → `IProjectQuery`
 *  - Write paths      → `IProjectCommand`
 *  - Summary/activity → `IProjectMetrics`
 *  - Access settings  → `IProjectAccessQuery` / `IProjectAccessCommand`
 *  - Pending invites  → `IInviteQuery.findForProject` (directly — no
 *                       projects facade method needed; the legacy
 *                       `ProjectsService.getInvites` was a thin
 *                       delegator).
 *
 * Field-set compatibility
 * -----------------------
 * `ProjectSummary` is binary-compatible with the legacy `Project`
 * JSON shape for the field set the frontend consumes today (id, name,
 * key, description, templateId, isArchived, organizationId,
 * createdAt, updatedAt). The TypeORM-only fields (`organization`
 * relation, `templateConfig`, soft-delete columns) are intentionally
 * elided — they were never part of the documented API contract.
 */
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard, ProjectRoleGuard, StatefulCsrfGuard)
export class ProjectsController {
  constructor(
    @Inject(PROJECT_QUERY_TOKEN)
    private readonly projectsQuery: IProjectQuery,
    @Inject(PROJECT_COMMAND_TOKEN)
    private readonly projectsCommand: IProjectCommand,
    @Inject(PROJECT_METRICS_TOKEN)
    private readonly projectsMetrics: IProjectMetrics,
    @Inject(PROJECT_ACCESS_QUERY_TOKEN)
    private readonly accessQuery: IProjectAccessQuery,
    @Inject(PROJECT_ACCESS_COMMAND_TOKEN)
    private readonly accessCommand: IProjectAccessCommand,
    @Inject(INVITE_QUERY_TOKEN)
    private readonly invitesQuery: IInviteQuery,
    private readonly usersService: UsersService,
    private readonly statusesService: WorkflowStatusesService,
  ) {
    void this.usersService;
  }

  @RequirePermission('projects:create')
  @Post()
  @RequireCsrf()
  async create(
    @Body() dto: CreateProjectDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    const { userId, organizationId } = req.user;
    if (!organizationId) {
      throw new ForbiddenException(
        'User must belong to an organization to create projects',
      );
    }
    return this.projectsCommand.create({
      actorUserId: userId,
      name: dto.name,
      key: dto.key,
      description: dto.description,
      templateId: dto.templateId,
      leadUserId: dto.projectLeadId,
    });
  }

  @Get()
  async findAll(@Request() req: { user: JwtRequestUser }) {
    return this.projectsQuery.findForUser(
      req.user.userId,
      req.user.isSuperAdmin,
    );
  }

  @RequirePermission('projects:view')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.projectsQuery.findById(id);
  }

  @RequirePermission('projects:edit')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Patch(':id')
  @RequireCsrf()
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsCommand.update(id, {
      name: dto.name,
      description: dto.description,
    });
  }

  @RequirePermission('projects:delete')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Patch(':id/archive')
  @RequireCsrf()
  async archive(@Param('id') id: string) {
    return this.projectsCommand.archive(id);
  }

  @RequirePermission('projects:delete')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Delete(':id')
  @RequireCsrf()
  async remove(@Param('id') id: string) {
    await this.projectsCommand.remove(id);
    return { message: 'Project deleted successfully' };
  }

  @RequirePermission('projects:view')
  @Get(':id/summary')
  async summary(@Param('id') id: string) {
    return this.projectsMetrics.getSummary(id);
  }

  @RequirePermission('projects:view')
  @Get(':id/activity')
  async activity(@Param('id') id: string) {
    return this.projectsMetrics.getActivity(id);
  }

  @Get(':id/invites')
  @RequirePermission('invites:view')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD, ProjectRole.MEMBER)
  getInvites(@Param('id') id: string) {
    return this.invitesQuery.findForProject(id);
  }

  @Get(':id/statuses')
  @RequirePermission('projects:view')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD, ProjectRole.MEMBER)
  async getStatuses(@Param('id') id: string) {
    return this.statusesService.findByProject(id);
  }

  @Get(':id/access-settings')
  @RequirePermission('projects:view')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD, ProjectRole.MEMBER)
  async getAccessSettings(@Param('id') id: string) {
    return this.accessQuery.getAccessSettings(id);
  }

  @Patch(':id/access-settings')
  @RequirePermission('projects:edit')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @RequireCsrf()
  async updateAccessSettings(
    @Param('id') id: string,
    @Body() dto: UpdateProjectAccessSettingsDto,
  ) {
    return this.accessCommand.updateAccessSettings(id, dto);
  }
}

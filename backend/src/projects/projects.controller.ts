import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Patch,
  Delete,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { WorkflowStatusesService } from '../workflows/services/workflow-statuses.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectAccessSettingsDto } from './dto/update-project-access-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { UsersService } from '../users/users.service';

import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { ProjectRoleGuard } from '../auth/guards/project-role.guard';
import { RequireProjectRole } from '../auth/decorators/require-project-role.decorator';

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard, ProjectRoleGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly statusesService: WorkflowStatusesService,
  ) {}

  /**
   * Create a new project (auto-scoped to user's organization)
   */
  @RequirePermission('projects:create')
  @Post()
  async create(
    @Body() dto: CreateProjectDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    const userId = req.user.userId;

    const organizationId = req.user.organizationId;

    if (!organizationId) {
      throw new ForbiddenException(
        'User must belong to an organization to create projects',
      );
    }

    return this.projectsService.create(userId, dto);
  }

  /**
   * List projects the user is a member of (filtered by organization).
   */
  @Get()
  async findAll(@Request() req: { user: JwtRequestUser }) {
    const userId = req.user.userId;
    return this.projectsService.findAllForUser(userId, req.user.isSuperAdmin);
  }

  /**
   * Get a project by ID (organization-scoped).
   */
  @RequirePermission('projects:view')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOneById(id);
  }

  /**
   * Update a project (organization-scoped).
   */
  @RequirePermission('projects:edit')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  /**
   * Archive a project (organization-scoped).
   */
  @RequirePermission('projects:delete')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Patch(':id/archive')
  async archive(@Param('id') id: string) {
    return this.projectsService.archive(id);
  }

  /**
   * Permanently delete a project (organization-scoped).
   */
  @RequirePermission('projects:delete')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.projectsService.remove(id);
    return { message: 'Project deleted successfully' };
  }

  @RequirePermission('projects:view')
  @Get(':id/summary')
  async summary(@Param('id') id: string) {
    return this.projectsService.getSummary(id);
  }

  @RequirePermission('projects:view')
  @Get(':id/activity')
  async activity(@Param('id') id: string) {
    return this.projectsService.getProjectActivity(id);
  }

  @Get(':id/invites')
  @RequirePermission('invites:view')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD, ProjectRole.MEMBER)
  getInvites(@Param('id') id: string) {
    return this.projectsService.getInvites(id);
  }

  @Get(':id/statuses')
  @RequirePermission('projects:view')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD, ProjectRole.MEMBER)
  async getStatuses(@Param('id') id: string) {
    return this.statusesService.findByProject(id);
  }

  /**
   * Get access control settings for a project
   */
  @Get(':id/access-settings')
  @RequirePermission('projects:view')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD, ProjectRole.MEMBER)
  async getAccessSettings(@Param('id') id: string) {
    return this.projectsService.getAccessSettings(id);
  }

  /**
   * Update access control settings for a project
   */
  @Patch(':id/access-settings')
  @RequirePermission('projects:edit')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  async updateAccessSettings(
    @Param('id') id: string,
    @Body() dto: UpdateProjectAccessSettingsDto,
  ) {
    return this.projectsService.updateAccessSettings(id, dto);
  }
}

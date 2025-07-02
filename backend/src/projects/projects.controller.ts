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
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

interface JwtRequestUser {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
}

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * Create a new project
   */
  @RequirePermission('projects:create')
  @Post()
  async create(
    @Body() dto: CreateProjectDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    const userId = req.user.userId;
    return this.projectsService.create(userId, dto);
  }

  /**
   * List projects the user is a member of.
   * Any authenticated user: no @RequirePermission needed or you could add a custom 'projects:list' perm.
   */
  @Get()
  async findAll(@Request() req: { user: JwtRequestUser }) {
    return this.projectsService.findAllForUser(
      req.user.userId,
      req.user.isSuperAdmin,
    );
  }

  /**
   * Get a project by ID.
   * Only members or superadmin can view.
   */
  @RequirePermission('projects:view')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOneById(id);
  }

  /**
   * Update project fields.
   * Only ProjectLead or superadmin.
   */
  @RequirePermission('projects:update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  /**
   * Archive project.
   * Only ProjectLead or superadmin.
   */
  @RequirePermission('projects:update')
  @Patch(':id/archive')
  async archive(@Param('id') id: string) {
    return this.projectsService.archive(id);
  }

  /**
   * Delete project permanently.
   * Only ProjectLead or superadmin.
   */
  @RequirePermission('projects:delete')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.projectsService.remove(id);
    return { message: 'Project deleted' };
  }

  /**
   * Summary/progress endpoint.
   * Only members or superadmin.
   */
  @RequirePermission('projects:view')
  @Get(':id/summary')
  async summary(@Param('id') id: string) {
    return this.projectsService.getSummary(id);
  }

  /**
   * Project activity feed: recent revisions for all entities in the project
   */
  @RequirePermission('projects:view')
  @Get(':id/activity')
  async activity(@Param('id') id: string) {
    return this.projectsService.getProjectActivity(id);
  }

  @Get(':id/invites')
  @RequirePermission('invites:create')
  getInvites(@Param('id') id: string) {
    return this.projectsService.getInvites(id);
  }
}

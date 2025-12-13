// src/sprints/sprints.controller.ts
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
import { SprintsService } from './sprints.service';
import { UsersService } from '../users/users.service';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { AddIssueToSprintDto } from './dto/add-issue.dto';
import { RemoveIssueFromSprintDto } from './dto/remove-issue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { RequireProjectRole } from '../auth/decorators/require-project-role.decorator';
import { Query } from '@nestjs/common';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { ProjectRoleGuard } from '../auth/guards/project-role.guard';

@Controller('projects/:projectId/sprints')
@UseGuards(JwtAuthGuard, PermissionsGuard, ProjectRoleGuard)
export class SprintsController {
  constructor(
    private readonly sprintsService: SprintsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Helper: Get user's organization ID
   */
  private async getUserOrganization(
    userId: string,
  ): Promise<string | undefined> {
    const user = await this.usersService.findOneById(userId);
    return user.organizationId;
  }

  @RequirePermission('sprints:create')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.sprintsService.create(projectId, req.user.userId, dto, orgId);
  }

  @RequirePermission('sprints:view')
  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
    @Query('active') active?: string,
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.sprintsService.findAll(
      projectId,
      req.user.userId,
      active === 'true',
      orgId,
    );
  }

  @RequirePermission('sprints:view')
  @Get(':sprintId')
  async findOne(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.sprintsService.findOne(
      projectId,
      sprintId,
      req.user.userId,
      orgId,
    );
  }

  @RequirePermission('sprints:update')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Patch(':sprintId')
  async update(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: UpdateSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.sprintsService.update(
      projectId,
      sprintId,
      req.user.userId,
      dto,
      orgId,
    );
  }

  @RequirePermission('sprints:update')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Patch(':sprintId/archive')
  async archive(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body('nextSprintId') nextSprintId: string | undefined,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.sprintsService.archive(
      projectId,
      sprintId,
      req.user.userId,
      nextSprintId,
      orgId,
    );
  }

  @RequirePermission('sprints:delete')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Delete(':sprintId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    await this.sprintsService.remove(
      projectId,
      sprintId,
      req.user.userId,
      orgId,
    );
    return { message: 'Sprint deleted' };
  }

  @RequirePermission('sprints:update')
  @RequireProjectRole(ProjectRole.MEMBER, ProjectRole.PROJECT_LEAD)
  @Post(':sprintId/issues')
  async addIssue(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: AddIssueToSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.sprintsService.addIssue(
      projectId,
      sprintId,
      req.user.userId,
      dto,
      orgId,
    );
  }

  @RequirePermission('sprints:update')
  @RequireProjectRole(ProjectRole.MEMBER, ProjectRole.PROJECT_LEAD)
  @Delete(':sprintId/issues')
  async removeIssue(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: RemoveIssueFromSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    await this.sprintsService.removeIssue(
      projectId,
      sprintId,
      req.user.userId,
      dto,
      orgId,
    );
    return { message: 'Issue removed from sprint' };
  }

  @RequirePermission('sprints:view')
  @Get(':sprintId/issues')
  async getSprintIssues(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.sprintsService.getSprintIssues(
      projectId,
      sprintId,
      req.user.userId,
      orgId,
    );
  }

  @RequirePermission('sprints:update')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @Patch(':sprintId/start')
  async startSprint(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.sprintsService.startSprint(
      projectId,
      sprintId,
      req.user.userId,
      orgId,
    );
  }

  @RequirePermission('sprints:view')
  @Get(':sprintId/burndown')
  async getBurndown(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.sprintsService.getBurndown(
      projectId,
      sprintId,
      req.user.userId,
    );
  }

  @RequirePermission('sprints:view')
  @Get('analytics/velocity')
  async getVelocity(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.sprintsService.getVelocity(projectId, req.user.userId);
  }
}

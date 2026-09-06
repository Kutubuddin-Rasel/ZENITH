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
  Inject,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
// SOLID Refactor (Step 3): the controller injects the ISP tokens, not
// the concrete `SprintsService`. Each endpoint depends only on the
// surface it actually calls (query / command / lifecycle / membership /
// metrics) — the god class is no longer referenced here.
import {
  SPRINT_QUERY_TOKEN,
  SPRINT_COMMAND_TOKEN,
  SPRINT_LIFECYCLE_TOKEN,
  SPRINT_MEMBERSHIP_TOKEN,
  SPRINT_METRICS_TOKEN,
} from './constants/sprints.tokens';
import type {
  ISprintQuery,
  ISprintCommand,
  ISprintLifecycle,
  ISprintMembership,
  ISprintMetrics,
} from './interfaces/sprints.interfaces';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { AddIssueToSprintDto } from './dto/add-issue.dto';
import { RemoveIssueFromSprintDto } from './dto/remove-issue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { RequireProjectRole } from '../auth/decorators/require-project-role.decorator';
import { Query } from '@nestjs/common';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { ProjectRoleGuard } from '../auth/guards/project-role.guard';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf';

/**
 * SprintsController - Manages sprint lifecycle.
 *
 * CSRF Protection: Mutations require x-csrf-token header.
 * GET endpoints (burndown, velocity, etc.) are exempt.
 */
@Controller('projects/:projectId/sprints')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard, ProjectRoleGuard)
export class SprintsController {
  constructor(
    @Inject(SPRINT_QUERY_TOKEN)
    private readonly sprintQuery: ISprintQuery,
    @Inject(SPRINT_COMMAND_TOKEN)
    private readonly sprintCommand: ISprintCommand,
    @Inject(SPRINT_LIFECYCLE_TOKEN)
    private readonly sprintLifecycle: ISprintLifecycle,
    @Inject(SPRINT_MEMBERSHIP_TOKEN)
    private readonly sprintMembership: ISprintMembership,
    @Inject(SPRINT_METRICS_TOKEN)
    private readonly sprintMetrics: ISprintMetrics,
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
  @RequireCsrf()
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintCommand.create(projectId, req.user.userId, dto);
  }

  @RequirePermission('sprints:view')
  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
    @Query('active') active?: string,
  ) {
    return this.sprintQuery.findAll(
      projectId,
      req.user.userId,
      active === 'true',
    );
  }

  @RequirePermission('sprints:view')
  @Get(':sprintId')
  async findOne(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintQuery.findOne(projectId, sprintId, req.user.userId);
  }

  @RequirePermission('sprints:update')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @RequireCsrf()
  @Patch(':sprintId')
  async update(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: UpdateSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintCommand.update(projectId, sprintId, req.user.userId, dto);
  }

  @RequirePermission('sprints:update')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @RequireCsrf()
  @Patch(':sprintId/archive')
  async archive(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body('nextSprintId') nextSprintId: string | undefined,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintLifecycle.archive(
      projectId,
      sprintId,
      req.user.userId,
      nextSprintId,
    );
  }

  @RequirePermission('sprints:delete')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @RequireCsrf()
  @Delete(':sprintId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.sprintCommand.remove(projectId, sprintId, req.user.userId);
    return { message: 'Sprint deleted' };
  }

  @RequirePermission('sprints:update')
  @RequireProjectRole(ProjectRole.MEMBER, ProjectRole.PROJECT_LEAD)
  @RequireCsrf()
  @Post(':sprintId/issues')
  async addIssue(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: AddIssueToSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintMembership.addIssue(
      projectId,
      sprintId,
      req.user.userId,
      dto,
    );
  }

  @RequirePermission('sprints:update')
  @RequireProjectRole(ProjectRole.MEMBER, ProjectRole.PROJECT_LEAD)
  @RequireCsrf()
  @Delete(':sprintId/issues')
  async removeIssue(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: RemoveIssueFromSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.sprintMembership.removeIssue(
      projectId,
      sprintId,
      req.user.userId,
      dto,
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
    return this.sprintQuery.getSprintIssues(
      projectId,
      sprintId,
      req.user.userId,
    );
  }

  @RequirePermission('sprints:update')
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @RequireCsrf()
  @Patch(':sprintId/start')
  async startSprint(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintCommand.startSprint(projectId, sprintId, req.user.userId);
  }

  @RequirePermission('sprints:view')
  @Get(':sprintId/burndown')
  async getBurndown(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintMetrics.getBurndown(projectId, sprintId, req.user.userId);
  }

  @RequirePermission('sprints:view')
  @Get('analytics/velocity')
  async getVelocity(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintMetrics.getVelocity(projectId, req.user.userId);
  }

  @RequirePermission('sprints:view')
  @Get(':sprintId/burnup')
  async getBurnup(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintMetrics.getBurnup(projectId, sprintId, req.user.userId);
  }
}

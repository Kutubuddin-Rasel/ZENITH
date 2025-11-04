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
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { AddIssueToSprintDto } from './dto/add-issue.dto';
import { RemoveIssueFromSprintDto } from './dto/remove-issue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { Query } from '@nestjs/common';

@Controller('projects/:projectId/sprints')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @RequirePermission('sprints:create')
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintsService.create(projectId, req.user.userId, dto);
  }

  @RequirePermission('sprints:view')
  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
    @Query('active') active?: string,
  ) {
    return this.sprintsService.findAll(projectId, req.user.userId, active);
  }

  @RequirePermission('sprints:view')
  @Get(':sprintId')
  async findOne(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintsService.findOne(projectId, sprintId, req.user.userId);
  }

  @RequirePermission('sprints:update')
  @Patch(':sprintId')
  async update(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: UpdateSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintsService.update(
      projectId,
      sprintId,
      req.user.userId,
      dto,
    );
  }

  @RequirePermission('sprints:update')
  @Patch(':sprintId/archive')
  async archive(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body('nextSprintId') nextSprintId: string | undefined,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintsService.archive(
      projectId,
      sprintId,
      req.user.userId,
      nextSprintId,
    );
  }

  @RequirePermission('sprints:delete')
  @Delete(':sprintId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.sprintsService.remove(projectId, sprintId, req.user.userId);
    return { message: 'Sprint deleted' };
  }

  @RequirePermission('sprints:update')
  @Post(':sprintId/issues')
  async addIssue(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: AddIssueToSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintsService.addIssue(
      projectId,
      sprintId,
      req.user.userId,
      dto,
    );
  }

  @RequirePermission('sprints:update')
  @Delete(':sprintId/issues')
  async removeIssue(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: RemoveIssueFromSprintDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.sprintsService.removeIssue(
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
    return this.sprintsService.getSprintIssues(
      projectId,
      sprintId,
      req.user.userId,
    );
  }

  @RequirePermission('sprints:update')
  @Patch(':sprintId/start')
  async startSprint(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.sprintsService.startSprint(
      projectId,
      sprintId,
      req.user.userId,
    );
  }
}

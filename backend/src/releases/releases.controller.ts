// src/releases/releases.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReleasesService } from './releases.service';
import { CreateReleaseDto } from './dto/create-release.dto';
import { UpdateReleaseDto } from './dto/update-release.dto';
import { AssignIssueDto } from './dto/assign-issue.dto';
import { UnassignIssueDto } from './dto/unassign-issue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';

@Controller('projects/:projectId/releases')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReleasesController {
  constructor(private svc: ReleasesService) {}

  @RequirePermission('releases:create')
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateReleaseDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.create(projectId, req.user.userId, dto);
  }

  @RequirePermission('releases:view')
  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.findAll(projectId, req.user.userId);
  }

  @RequirePermission('releases:view')
  @Get(':releaseId')
  async findOne(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.findOne(projectId, releaseId, req.user.userId);
  }

  @RequirePermission('releases:update')
  @Patch(':releaseId')
  async update(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: UpdateReleaseDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.update(projectId, releaseId, req.user.userId, dto);
  }

  @RequirePermission('releases:delete')
  @Delete(':releaseId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.remove(projectId, releaseId, req.user.userId);
    return { message: 'Release deleted' };
  }

  @RequirePermission('releases:update')
  @Post(':releaseId/issues')
  async assignIssue(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: AssignIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.assignIssue(projectId, releaseId, req.user.userId, dto);
  }

  @RequirePermission('releases:update')
  @Delete(':releaseId/issues')
  async unassignIssue(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: UnassignIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.unassignIssue(projectId, releaseId, req.user.userId, dto);
    return { message: 'Issue unassigned from release' };
  }
}

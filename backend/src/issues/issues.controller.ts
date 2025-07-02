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
  Query,
} from '@nestjs/common';
import { IssuesService, WorkLogsService } from './issues.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { IssueStatus } from './entities/issue.entity';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { CreateWorkLogDto } from './dto/create-work-log.dto';
import { UpdateWorkLogDto } from './dto/update-work-log.dto';

@Controller('projects/:projectId/issues')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IssuesController {
  constructor(
    private readonly issuesService: IssuesService,
    private readonly workLogsService: WorkLogsService,
  ) {}

  @RequirePermission('issues:create')
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    const reporterId = req.user.userId;
    return this.issuesService.create(projectId, reporterId, dto);
  }

  @RequirePermission('issues:view')
  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
    @Query('status') status?: IssueStatus,
    @Query('assigneeId') assigneeId?: string,
    @Query('search') search?: string,
    @Query('label') label?: string,
    @Query('sprint') sprint?: string,
    @Query('sort') sort?: string,
  ) {
    const userId = req.user.userId;
    const filters: any = {};
    if (status) filters.status = status;
    if (assigneeId) filters.assigneeId = assigneeId;
    if (search) filters.search = search;
    if (label) filters.label = label;
    if (sprint) filters.sprint = sprint;
    if (sort) filters.sort = sort;
    return this.issuesService.findAll(projectId, userId, filters);
  }

  @RequirePermission('issues:view')
  @Get(':id')
  async findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.findOne(projectId, id, req.user.userId);
  }

  @RequirePermission('issues:update')
  @Patch(':id/status')
  async updateStatus(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body('status') status: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.updateStatus(projectId, id, status, req.user.userId);
  }

  @RequirePermission('issues:update')
  @Patch(':id')
  async update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.update(projectId, id, req.user.userId, dto);
  }

  @RequirePermission('issues:delete')
  @Delete(':id')
  async remove(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.issuesService.remove(projectId, id, req.user.userId);
    return { message: 'Issue deleted' };
  }

  @RequirePermission('issues:view')
  @Get(':issueId/worklogs')
  async listWorkLogs(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
  ) {
    return this.workLogsService.listWorkLogs(projectId, issueId);
  }

  @RequirePermission('issues:update')
  @Post(':issueId/worklogs')
  async addWorkLog(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateWorkLogDto,
  ) {
    return this.workLogsService.addWorkLog(projectId, issueId, req.user.userId, dto.minutesSpent, dto.note);
  }

  @RequirePermission('issues:update')
  @Delete(':issueId/worklogs/:workLogId')
  async deleteWorkLog(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Param('workLogId') workLogId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.workLogsService.deleteWorkLog(projectId, issueId, workLogId, req.user.userId);
  }

  @RequirePermission('issues:update')
  @Patch(':issueId/worklogs/:workLogId')
  async updateWorkLog(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Param('workLogId') workLogId: string,
    @Request() req: { user: { userId: string } },
    @Body() dto: UpdateWorkLogDto,
  ) {
    return this.workLogsService.updateWorkLog(projectId, issueId, workLogId, req.user.userId, dto.minutesSpent, dto.note);
  }
}

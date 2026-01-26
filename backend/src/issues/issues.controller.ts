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
  Header,
  StreamableFile,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpStatus,
} from '@nestjs/common';
import { LinkType } from './entities/issue-link.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform } from 'stream';
import { IssuesService, WorkLogsService } from './issues.service';
import { UsersService } from '../users/users.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRoleGuard } from '../auth/guards/project-role.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { IssueStatus } from './entities/issue.entity';
import { MoveIssueDto } from './dto/move-issue.dto';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { RequireProjectRole } from '../auth/decorators/require-project-role.decorator';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { CreateWorkLogDto } from './dto/create-work-log.dto';
import { UpdateWorkLogDto } from './dto/update-work-log.dto';
import { PoliciesGuard, CheckPolicies } from '../auth/casl/policies.guard';
import { Action } from '../auth/casl/casl-ability.factory';
import { Issue } from './entities/issue.entity';

@Controller('projects/:projectId/issues')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IssuesController {
  constructor(
    private readonly issuesService: IssuesService,
    private readonly workLogsService: WorkLogsService,
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

  @CheckPolicies((ability) => ability.can(Action.Create, Issue))
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    const reporterId = req.user.userId;
    // orgId removed as per cleanup
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
    @Query('includeArchived') includeArchived?: string,
  ) {
    const userId = (req.user as unknown as Record<string, unknown>)
      .userId as string;
    const filters: {
      status?: IssueStatus;
      assigneeId?: string;
      search?: string;
      label?: string;
      sprint?: string;
      sort?: string;
      includeArchived?: boolean;
    } = {};
    if (status) filters.status = status;
    if (assigneeId) filters.assigneeId = assigneeId;
    if (search) filters.search = search;
    if (label) filters.label = label;
    if (sort) filters.sort = sort;
    if (includeArchived) filters.includeArchived = includeArchived === 'true';
    return this.issuesService.findAll(projectId, userId, filters);
  }

  @Get('export')
  @RequirePermission('issues:view')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="issues.csv"')
  async exportIssues(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ): Promise<StreamableFile> {
    const stream = await this.issuesService.getIssuesStream(
      projectId,
      req.user.userId,
    );

    interface IssueExportRow {
      issue_id: string;
      issue_title: string;
      issue_description: string;
      issue_status: string;
      issue_priority: string;
      issue_type: string;
      issue_storyPoints: number;
      issue_createdAt: Date;
      issue_updatedAt: Date;
      assignee_name: string;
      assignee_email: string;
      reporter_name: string;
      reporter_email: string;
      parent_title: string;
    }

    const csvStream = new Transform({
      objectMode: true,
      transform(chunk: IssueExportRow, encoding, callback) {
        const row = [
          chunk.issue_id,
          `"${(chunk.issue_title || '').replace(/"/g, '""')}"`,
          `"${(chunk.issue_description || '').replace(/"/g, '""')}"`,
          chunk.issue_status,
          chunk.issue_priority,
          chunk.issue_type,
          chunk.issue_storyPoints,
          chunk.issue_createdAt,
          chunk.issue_updatedAt,
          chunk.assignee_name || '',
          chunk.assignee_email || '',
          chunk.reporter_name || '',
          chunk.reporter_email || '',
          `"${(chunk.parent_title || '').replace(/"/g, '""')}"`,
        ].join(',');

        callback(null, row + '\n');
      },
    });

    const headers =
      [
        'ID',
        'Title',
        'Description',
        'Status',
        'Priority',
        'Type',
        'Story Points',
        'Created At',
        'Updated At',
        'Assignee Name',
        'Assignee Email',
        'Reporter Name',
        'Reporter Email',
        'Parent Issue',
      ].join(',') + '\n';

    csvStream.push(headers);

    return new StreamableFile(stream.pipe(csvStream));
  }

  @Post('import')
  @RequirePermission('issues:create')
  @UseInterceptors(FileInterceptor('file'))
  async importIssues(
    @Param('projectId') projectId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: 'csv',
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.importIssues(
      projectId,
      file.buffer,
      req.user.userId,
    );
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
    return this.issuesService.updateStatus(
      projectId,
      id,
      status,
      req.user.userId,
    );
  }

  /**
   * Unified move endpoint for drag-and-drop operations.
   * Handles sprint assignment, status changes, and position updates atomically.
   */
  @RequirePermission('issues:update')
  @Post(':id/move')
  async moveIssue(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: MoveIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.moveIssue(projectId, id, req.user.userId, dto);
  }

  @Patch(':issueId')
  @UseGuards(JwtAuthGuard, ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.MEMBER, ProjectRole.PROJECT_LEAD)
  update(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() updateIssueDto: UpdateIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.update(
      projectId,
      issueId,
      req.user.userId,
      updateIssueDto,
    );
  }

  @Delete(':issueId')
  @UseGuards(JwtAuthGuard, ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  remove(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.remove(projectId, issueId, req.user.userId);
  }

  @RequirePermission('issues:delete')
  @Post(':id/archive')
  async archive(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.archive(projectId, id, req.user.userId);
  }

  @RequirePermission('issues:delete')
  @Post(':id/unarchive')
  async unarchive(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.unarchive(projectId, id, req.user.userId);
  }

  @RequirePermission('issues:view')
  @Get(':id/links')
  async getLinks(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.getLinks(projectId, id, req.user.userId);
  }

  @RequirePermission('issues:update')
  @Post(':id/links')
  async addLink(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: { targetIssueId: string; type: LinkType },
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.addLink(
      projectId,
      id,
      body.targetIssueId,
      body.type,
      req.user.userId,
    );
  }

  @RequirePermission('issues:update')
  @Delete(':id/links/:linkId')
  async removeLink(
    @Param('projectId') projectId: string,
    @Param('id') id: string, // unused but for path consistency
    @Param('linkId') linkId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.issuesService.removeLink(projectId, linkId, req.user.userId);
    return { message: 'Link removed' };
  }

  @RequirePermission('issues:update')
  @Patch(':id/labels')
  async updateLabels(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: { labels: string[] },
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.issuesService.updateLabels(
      projectId,
      id,
      body.labels,
      req.user.userId,
    );
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
    return this.workLogsService.addWorkLog(
      projectId,
      issueId,
      req.user.userId,
      dto.minutesSpent,
      dto.note,
    );
  }

  @RequirePermission('issues:update')
  @Delete(':issueId/worklogs/:workLogId')
  async deleteWorkLog(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Param('workLogId') workLogId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.workLogsService.deleteWorkLog(
      projectId,
      issueId,
      workLogId,
      req.user.userId,
    );
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
    return this.workLogsService.updateWorkLog(
      projectId,
      issueId,
      workLogId,
      req.user.userId,
      dto.minutesSpent,
      dto.note,
    );
  }
}

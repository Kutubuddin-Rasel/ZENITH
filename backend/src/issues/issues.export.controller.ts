import {
  Controller,
  Get,
  Param,
  UseGuards,
  Header,
  StreamableFile,
  Request,
} from '@nestjs/common';
import { IssuesService } from './issues.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/authenticated-request.interface';
import { Transform } from 'stream';

@Controller('projects/:projectId/issues/export')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IssuesExportController {
  constructor(private readonly issuesService: IssuesService) {}

  @Get()
  @RequirePermission('issues:view')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="issues.csv"')
  async exportIssues(
    @Param('projectId') projectId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const stream = await this.issuesService.getIssuesStream(
      projectId,
      req.user.id,
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
}

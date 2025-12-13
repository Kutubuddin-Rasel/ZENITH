import {
  Controller,
  Post,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  ParseFilePipeBuilder,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IssuesService } from './issues.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/authenticated-request.interface';

@Controller('projects/:projectId/issues/import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IssuesImportController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
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
    @Request() req: AuthenticatedRequest,
  ) {
    return this.issuesService.importIssues(projectId, file.buffer, req.user.id);
  }
}

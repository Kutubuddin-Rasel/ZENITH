// src/attachments/attachments.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Express } from 'express';
import { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { VirusScanningService } from './services/virus-scanning.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf/csrf.guard';
import { attachmentFileFilter } from './config/file-filter.config';
import { safeFilenameCallback } from './config/filename-sanitizer.config';
import { validateFileMagicNumber } from './config/magic-number-validator.config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AttachmentsController - Multi-target file uploads
 * 
 * CSRF Protection: Uploads and deletes require x-csrf-token header.
 * MIME Filtering: Only allowed file types accepted.
 */
@Controller()
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class AttachmentsController {
  constructor(
    private svc: AttachmentsService,
    private virusScanner: VirusScanningService,
  ) { }

  // Project-level attachments (general project files)
  @RequireCsrf()
  @RequirePermission('attachments:create')
  @Post('projects/:projectId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: safeFilenameCallback,
      }),
      fileFilter: attachmentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadProject(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    const { filename, path: filepath } = file;

    // SECURITY: Validate magic number matches claimed MIME type
    await validateFileMagicNumber(filepath, file.mimetype);

    // SECURITY: Scan file for viruses/malware
    await this.virusScanner.scanFile(filepath, req.user.userId);

    return this.svc.createForProject(
      projectId,
      req.user.userId,
      filename,
      filepath,
      file.originalname,
      file.size,
      file.mimetype,
    );
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/attachments')
  async findAllProject(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.findAllForProject(projectId, req.user.userId);
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/attachments/history')
  async getProjectAttachmentHistory(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.getHistory(projectId, req.user.userId);
  }

  @RequireCsrf()
  @RequirePermission('attachments:delete')
  @Delete('projects/:projectId/attachments/:attachmentId')
  async removeProject(
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.removeForProject(projectId, attachmentId, req.user.userId);
    return { message: 'Attachment deleted' };
  }

  @RequireCsrf()
  @RequirePermission('attachments:create')
  @Post('projects/:projectId/issues/:issueId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: safeFilenameCallback,
      }),
      fileFilter: attachmentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadIssue(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    const { filename, path: filepath } = file;

    // SECURITY: Validate magic number matches claimed MIME type
    await validateFileMagicNumber(filepath, file.mimetype);

    // SECURITY: Scan file for viruses/malware
    await this.virusScanner.scanFile(filepath, req.user.userId);

    return this.svc.createForIssue(
      projectId,
      issueId,
      req.user.userId,
      filename,
      filepath,
    );
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/issues/:issueId/attachments')
  async findAllIssue(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.findAllForIssue(projectId, issueId, req.user.userId);
  }

  @RequireCsrf()
  @RequirePermission('attachments:delete')
  @Delete('projects/:projectId/issues/:issueId/attachments/:attachmentId')
  async removeIssue(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.removeForIssue(
      projectId,
      issueId,
      attachmentId,
      req.user.userId,
    );
    return { message: 'Attachment deleted' };
  }

  @RequireCsrf()
  @RequirePermission('attachments:create')
  @Post('projects/:projectId/releases/:releaseId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: safeFilenameCallback,
      }),
      fileFilter: attachmentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadRelease(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    const { filename, path: filepath } = file;

    // SECURITY: Validate magic number matches claimed MIME type
    await validateFileMagicNumber(filepath, file.mimetype);

    // SECURITY: Scan file for viruses/malware
    await this.virusScanner.scanFile(filepath, req.user.userId);

    return this.svc.createForRelease(
      projectId,
      releaseId,
      req.user.userId,
      filename,
      filepath,
    );
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/releases/:releaseId/attachments')
  async findAllRelease(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.findAllForRelease(projectId, releaseId, req.user.userId);
  }

  @RequireCsrf()
  @RequirePermission('attachments:delete')
  @Delete('projects/:projectId/releases/:releaseId/attachments/:attachmentId')
  async removeRelease(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.removeForRelease(
      projectId,
      releaseId,
      attachmentId,
      req.user.userId,
    );
    return { message: 'Attachment deleted' };
  }

  // Sprint attachments
  @RequireCsrf()
  @RequirePermission('attachments:create')
  @Post('projects/:projectId/sprints/:sprintId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: safeFilenameCallback,
      }),
      fileFilter: attachmentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadSprint(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    const { filename, path: filepath } = file;

    // SECURITY: Validate magic number matches claimed MIME type
    await validateFileMagicNumber(filepath, file.mimetype);

    // SECURITY: Scan file for viruses/malware
    await this.virusScanner.scanFile(filepath, req.user.userId);

    return this.svc.createForSprint(
      projectId,
      sprintId,
      req.user.userId,
      filename,
      filepath,
    );
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/sprints/:sprintId/attachments')
  async findAllSprint(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.findAllForSprint(projectId, sprintId, req.user.userId);
  }

  @RequireCsrf()
  @RequirePermission('attachments:delete')
  @Delete('projects/:projectId/sprints/:sprintId/attachments/:attachmentId')
  async removeSprint(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.removeForSprint(
      projectId,
      sprintId,
      attachmentId,
      req.user.userId,
    );
    return { message: 'Attachment deleted' };
  }

  // Comment attachments
  @RequireCsrf()
  @RequirePermission('attachments:create')
  @Post('projects/:projectId/issues/:issueId/comments/:commentId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: safeFilenameCallback,
      }),
      fileFilter: attachmentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadComment(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Param('commentId') commentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    const { filename, path: filepath } = file;

    // SECURITY: Validate magic number matches claimed MIME type
    await validateFileMagicNumber(filepath, file.mimetype);

    // SECURITY: Scan file for viruses/malware
    await this.virusScanner.scanFile(filepath, req.user.userId);

    return this.svc.createForComment(
      projectId,
      issueId,
      commentId,
      req.user.userId,
      filename,
      filepath,
    );
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/issues/:issueId/comments/:commentId/attachments')
  async findAllComment(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Param('commentId') commentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.findAllForComment(
      projectId,
      issueId,
      commentId,
      req.user.userId,
    );
  }

  @RequireCsrf()
  @RequirePermission('attachments:delete')
  @Delete(
    'projects/:projectId/issues/:issueId/comments/:commentId/attachments/:attachmentId',
  )
  async removeComment(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Param('commentId') commentId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.removeForComment(
      projectId,
      issueId,
      commentId,
      attachmentId,
      req.user.userId,
    );
    return { message: 'Attachment deleted' };
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: { user: JwtRequestUser },
    @Res() res: Response,
  ) {
    const attachment = await this.svc.findForProject(projectId, attachmentId);
    if (!attachment) {
      return res.status(404).send('Attachment not found');
    }

    // Verify user is a member of the project
    await this.svc['membersService'].getUserRole(projectId, req.user.userId);

    // SECURITY: Use jail-checked path resolution (Path Traversal Defense)
    const { resolveSafeFilePath } = await import('./config/path-security.config');
    const filePath = resolveSafeFilePath(attachment.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }

    const originalName = attachment.originalName || attachment.filename;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${originalName}"`,
    );
    if (attachment.mimeType) {
      res.setHeader('Content-Type', attachment.mimeType);
    }

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }
}

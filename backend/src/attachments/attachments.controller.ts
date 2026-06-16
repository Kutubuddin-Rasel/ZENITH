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
  Inject,
} from '@nestjs/common';
import { Express, Response } from 'express';
import {
  ATTACHMENT_COMMAND_TOKEN,
  ATTACHMENT_QUERY_TOKEN,
  FILE_STORAGE_PROVIDER,
} from './constants/attachments.tokens';
import type {
  AttachmentContext,
  IAttachmentCommand,
  IAttachmentQuery,
  IStoragePort,
  UploadedFileMeta,
} from './interfaces/attachments.interfaces';
import { VirusScanningService } from './services/virus-scanning.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf';
import { validateFileMagicNumber } from './config/magic-number-validator.config';
import { attachmentUploadInterceptor } from './config/attachment-upload.interceptor';
import { resolveSafeFilePath } from './config/path-security.config';
import * as fs from 'fs';

/**
 * AttachmentsController - Multi-target file uploads
 *
 * Thin HTTP adapter over the attachments CQRS ports. Each route maps its parent
 * param to an `AttachmentContext` `target` and dispatches through
 * `ATTACHMENT_QUERY_TOKEN` / `ATTACHMENT_COMMAND_TOKEN` — the controller no
 * longer knows about TypeORM, the `uploads/` directory, or how files are stored.
 *
 * CSRF Protection: Uploads and deletes require x-csrf-token header.
 * MIME Filtering: Only allowed file types accepted.
 */
@Controller()
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class AttachmentsController {
  constructor(
    @Inject(ATTACHMENT_QUERY_TOKEN)
    private readonly query: IAttachmentQuery,
    @Inject(ATTACHMENT_COMMAND_TOKEN)
    private readonly command: IAttachmentCommand,
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly storage: IStoragePort,
    private readonly virusScanner: VirusScanningService,
  ) {}

  /**
   * Run the stateless security pre-checks (magic-number + ClamAV) and normalize
   * the Multer file into the storage-agnostic `UploadedFileMeta` the command
   * port understands. Centralized so every upload route shares one pipeline.
   */
  private async prepareUpload(
    file: Express.Multer.File,
    userId: string,
  ): Promise<UploadedFileMeta> {
    // SECURITY: claimed MIME must match the file's real magic number.
    await validateFileMagicNumber(file.path, file.mimetype);
    // SECURITY: scan for viruses/malware before it is ever persisted.
    await this.virusScanner.scanFile(file.path, userId);
    return {
      filename: file.filename,
      filepath: file.path,
      originalName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  }

  // ───────────────────────────── Project ──────────────────────────────
  @RequireCsrf()
  @RequirePermission('attachments:create')
  @Post('projects/:projectId/attachments')
  @UseInterceptors(attachmentUploadInterceptor())
  async uploadProject(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    const ctx: AttachmentContext = {
      target: 'project',
      projectId,
      userId: req.user.userId,
    };
    return this.command.createForTarget(
      ctx,
      await this.prepareUpload(file, req.user.userId),
    );
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/attachments')
  async findAllProject(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.listForTarget({
      target: 'project',
      projectId,
      userId: req.user.userId,
    });
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/attachments/history')
  async getProjectAttachmentHistory(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.getHistory(projectId, req.user.userId);
  }

  @RequireCsrf()
  @RequirePermission('attachments:delete')
  @Delete('projects/:projectId/attachments/:attachmentId')
  async removeProject(
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.command.removeForTarget(
      { target: 'project', projectId, userId: req.user.userId },
      attachmentId,
    );
    return { message: 'Attachment deleted' };
  }

  // ────────────────────────────── Issue ───────────────────────────────
  @RequireCsrf()
  @RequirePermission('attachments:create')
  @Post('projects/:projectId/issues/:issueId/attachments')
  @UseInterceptors(attachmentUploadInterceptor())
  async uploadIssue(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    const ctx: AttachmentContext = {
      target: 'issue',
      projectId,
      parentId: issueId,
      userId: req.user.userId,
    };
    return this.command.createForTarget(
      ctx,
      await this.prepareUpload(file, req.user.userId),
    );
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/issues/:issueId/attachments')
  async findAllIssue(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.listForTarget({
      target: 'issue',
      projectId,
      parentId: issueId,
      userId: req.user.userId,
    });
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
    await this.command.removeForTarget(
      {
        target: 'issue',
        projectId,
        parentId: issueId,
        userId: req.user.userId,
      },
      attachmentId,
    );
    return { message: 'Attachment deleted' };
  }

  // ───────────────────────────── Release ──────────────────────────────
  @RequireCsrf()
  @RequirePermission('attachments:create')
  @Post('projects/:projectId/releases/:releaseId/attachments')
  @UseInterceptors(attachmentUploadInterceptor())
  async uploadRelease(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    const ctx: AttachmentContext = {
      target: 'release',
      projectId,
      parentId: releaseId,
      userId: req.user.userId,
    };
    return this.command.createForTarget(
      ctx,
      await this.prepareUpload(file, req.user.userId),
    );
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/releases/:releaseId/attachments')
  async findAllRelease(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.listForTarget({
      target: 'release',
      projectId,
      parentId: releaseId,
      userId: req.user.userId,
    });
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
    await this.command.removeForTarget(
      {
        target: 'release',
        projectId,
        parentId: releaseId,
        userId: req.user.userId,
      },
      attachmentId,
    );
    return { message: 'Attachment deleted' };
  }

  // ────────────────────────────── Sprint ──────────────────────────────
  @RequireCsrf()
  @RequirePermission('attachments:create')
  @Post('projects/:projectId/sprints/:sprintId/attachments')
  @UseInterceptors(attachmentUploadInterceptor())
  async uploadSprint(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    const ctx: AttachmentContext = {
      target: 'sprint',
      projectId,
      parentId: sprintId,
      userId: req.user.userId,
    };
    return this.command.createForTarget(
      ctx,
      await this.prepareUpload(file, req.user.userId),
    );
  }

  @RequirePermission('attachments:view')
  @Get('projects/:projectId/sprints/:sprintId/attachments')
  async findAllSprint(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.listForTarget({
      target: 'sprint',
      projectId,
      parentId: sprintId,
      userId: req.user.userId,
    });
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
    await this.command.removeForTarget(
      {
        target: 'sprint',
        projectId,
        parentId: sprintId,
        userId: req.user.userId,
      },
      attachmentId,
    );
    return { message: 'Attachment deleted' };
  }

  // ───────────────────────────── Comment ──────────────────────────────
  @RequireCsrf()
  @RequirePermission('attachments:create')
  @Post('projects/:projectId/issues/:issueId/comments/:commentId/attachments')
  @UseInterceptors(attachmentUploadInterceptor())
  async uploadComment(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Param('commentId') commentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    const ctx: AttachmentContext = {
      target: 'comment',
      projectId,
      issueId,
      parentId: commentId,
      userId: req.user.userId,
    };
    return this.command.createForTarget(
      ctx,
      await this.prepareUpload(file, req.user.userId),
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
    return this.query.listForTarget({
      target: 'comment',
      projectId,
      issueId,
      parentId: commentId,
      userId: req.user.userId,
    });
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
    await this.command.removeForTarget(
      {
        target: 'comment',
        projectId,
        issueId,
        parentId: commentId,
        userId: req.user.userId,
      },
      attachmentId,
    );
    return { message: 'Attachment deleted' };
  }

  // ───────────────────────────── Download ─────────────────────────────
  @RequirePermission('attachments:view')
  @Get('projects/:projectId/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: { user: JwtRequestUser },
    @Res() res: Response,
  ) {
    // findForDownload enforces project membership ITSELF — replacing the legacy
    // `svc['membersService']` private-field reach whose result was discarded.
    const attachment = await this.query.findForDownload(
      { target: 'project', projectId, userId: req.user.userId },
      attachmentId,
    );

    // Resolve the byte location through the storage port (presigned URL for S3,
    // local path for disk); then jail-check the local path before streaming.
    await this.storage.getDownloadUrl(attachment.filename);
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
    fs.createReadStream(filePath).pipe(res);
  }
}

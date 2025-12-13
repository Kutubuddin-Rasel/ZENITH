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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
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

  // ==================== Archive ====================

  @RequirePermission('releases:update')
  @Post(':releaseId/archive')
  async archive(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.archive(projectId, releaseId, req.user.userId);
  }

  // ==================== Issues ====================

  @RequirePermission('releases:view')
  @Get(':releaseId/issues')
  async getIssues(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.getIssues(projectId, releaseId, req.user.userId);
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
  @Post(':releaseId/issues/unassign')
  async unassignIssuePost(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: UnassignIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.unassignIssue(projectId, releaseId, req.user.userId, dto);
    return { message: 'Issue unassigned from release' };
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

  // ==================== Attachments ====================

  @RequirePermission('releases:view')
  @Get(':releaseId/attachments')
  async getAttachments(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.getAttachments(projectId, releaseId, req.user.userId);
  }

  @RequirePermission('releases:update')
  @Post(':releaseId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/releases',
        filename: (req, file, cb) => {
          const uniqueSuffix = uuidv4();
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadAttachment(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.addAttachment(projectId, releaseId, req.user.userId, {
      filename: file.originalname,
      filepath: `/uploads/releases/${file.filename}`,
      mimeType: file.mimetype,
      fileSize: file.size,
    });
  }

  @RequirePermission('releases:update')
  @Delete(':releaseId/attachments/:attachmentId')
  async deleteAttachment(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.deleteAttachment(
      projectId,
      releaseId,
      attachmentId,
      req.user.userId,
    );
    return { message: 'Attachment deleted' };
  }

  // ==================== Release Notes ====================

  @RequirePermission('releases:view')
  @Get(':releaseId/generate-notes')
  async generateNotes(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.generateReleaseNotes(projectId, releaseId, req.user.userId);
  }

  @RequirePermission('releases:update')
  @Post(':releaseId/generate-notes')
  async generateAndSaveNotes(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.generateAndSaveReleaseNotes(
      projectId,
      releaseId,
      req.user.userId,
    );
  }

  // ==================== Version Suggestions ====================

  @RequirePermission('releases:view')
  @Get('suggest-version')
  async suggestVersion(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    // Default to patch bump
    return this.svc.suggestNextVersion(projectId, req.user.userId, 'patch');
  }

  @RequirePermission('releases:view')
  @Get('suggest-version/:bumpType')
  async suggestVersionWithBump(
    @Param('projectId') projectId: string,
    @Param('bumpType') bumpType: 'major' | 'minor' | 'patch',
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.suggestNextVersion(projectId, req.user.userId, bumpType);
  }

  // ==================== Git Integration ====================

  @RequirePermission('releases:view')
  @Get(':releaseId/git')
  async getGitInfo(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.getGitInfo(projectId, releaseId, req.user.userId);
  }

  @RequirePermission('releases:update')
  @Post(':releaseId/git')
  async linkGit(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body()
    dto: {
      gitTagName?: string;
      gitBranch?: string;
      commitSha?: string;
      gitProvider?: string;
      gitRepoUrl?: string;
    },
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.linkGit(projectId, releaseId, req.user.userId, dto);
  }

  // ==================== Deployments ====================

  @RequirePermission('releases:update')
  @Post(':releaseId/deploy')
  async triggerDeploy(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: { webhookId?: string },
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.triggerDeploy(
      projectId,
      releaseId,
      dto.webhookId || '',
      req.user.userId,
    );
  }

  // ==================== Comparison & Rollback ====================

  @RequirePermission('releases:view')
  @Get(':releaseId/compare/:otherReleaseId')
  async compareReleases(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Param('otherReleaseId') otherReleaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.compareReleases(
      projectId,
      releaseId,
      otherReleaseId,
      req.user.userId,
    );
  }

  @RequirePermission('releases:create')
  @Post(':releaseId/rollback')
  async createRollback(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: { newVersionName?: string },
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.createRollback(
      projectId,
      releaseId,
      req.user.userId,
      dto.newVersionName,
    );
  }
}

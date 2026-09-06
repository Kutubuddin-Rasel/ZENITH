// src/releases/releases.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import {
  RELEASE_QUERY_TOKEN,
  RELEASE_COMMAND_TOKEN,
  RELEASE_DEPLOYMENT_TOKEN,
  RELEASE_NOTES_TOKEN,
} from './constants/releases.tokens';
import type {
  IReleaseQuery,
  IReleaseCommand,
  IReleaseDeployment,
  IReleaseNotes,
} from './interfaces/releases.interfaces';
import { CreateReleaseDto } from './dto/create-release.dto';
import { UpdateReleaseDto } from './dto/update-release.dto';
import { AssignIssueDto } from './dto/assign-issue.dto';
import { UnassignIssueDto } from './dto/unassign-issue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf';
import {
  releaseFileFilter,
  releaseFilenameCallback,
  RELEASE_MAX_FILE_SIZE,
} from './config/release-file-filter.config';
import { PaginatedReleasesQueryDto } from './dto/paginated-releases-query.dto';

/**
 * ReleasesController - Manages SDLC release lifecycle
 *
 * Thin HTTP adapter: depends only on the segregated release tokens
 * (query/command/deployment/notes), never a concrete service. CSRF Protection:
 * all mutations require x-csrf-token. Critical endpoints (triggerDeploy,
 * createRollback) carry the highest security impact.
 */
@Controller('projects/:projectId/releases')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class ReleasesController {
  constructor(
    @Inject(RELEASE_QUERY_TOKEN) private readonly query: IReleaseQuery,
    @Inject(RELEASE_COMMAND_TOKEN) private readonly command: IReleaseCommand,
    @Inject(RELEASE_DEPLOYMENT_TOKEN)
    private readonly deployment: IReleaseDeployment,
    @Inject(RELEASE_NOTES_TOKEN) private readonly notes: IReleaseNotes,
  ) {}

  @RequireCsrf()
  @RequirePermission('releases:create')
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateReleaseDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.create(projectId, req.user.userId, dto);
  }

  @RequirePermission('releases:view')
  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Query() query: PaginatedReleasesQueryDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.findAllPaginated(projectId, req.user.userId, query);
  }

  @RequirePermission('releases:view')
  @Get(':releaseId')
  async findOne(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.findOne(projectId, releaseId, req.user.userId);
  }

  @RequireCsrf()
  @RequirePermission('releases:update')
  @Patch(':releaseId')
  async update(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: UpdateReleaseDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.update(projectId, releaseId, req.user.userId, dto);
  }

  @RequireCsrf()
  @RequirePermission('releases:delete')
  @Delete(':releaseId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.command.remove(projectId, releaseId, req.user.userId);
    return { message: 'Release deleted' };
  }

  // ==================== Archive ====================

  @RequireCsrf()
  @RequirePermission('releases:update')
  @Post(':releaseId/archive')
  async archive(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.archive(projectId, releaseId, req.user.userId);
  }

  // ==================== Issues ====================

  @RequirePermission('releases:view')
  @Get(':releaseId/issues')
  async getIssues(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.getIssues(projectId, releaseId, req.user.userId);
  }

  @RequireCsrf()
  @RequirePermission('releases:update')
  @Post(':releaseId/issues')
  async assignIssue(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: AssignIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.assignIssue(projectId, releaseId, req.user.userId, dto);
  }

  @RequireCsrf()
  @RequirePermission('releases:update')
  @Post(':releaseId/issues/unassign')
  async unassignIssuePost(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: UnassignIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.command.unassignIssue(
      projectId,
      releaseId,
      req.user.userId,
      dto,
    );
    return { message: 'Issue unassigned from release' };
  }

  @RequireCsrf()
  @RequirePermission('releases:update')
  @Delete(':releaseId/issues')
  async unassignIssue(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: UnassignIssueDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.command.unassignIssue(
      projectId,
      releaseId,
      req.user.userId,
      dto,
    );
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
    return this.query.getAttachments(projectId, releaseId, req.user.userId);
  }

  @RequireCsrf()
  @RequirePermission('releases:update')
  @Post(':releaseId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/releases',
        filename: releaseFilenameCallback,
      }),
      fileFilter: releaseFileFilter,
      limits: { fileSize: RELEASE_MAX_FILE_SIZE },
    }),
  )
  // TODO: SECURITY - Phase 5: Add magic number (file-type) validation
  // Current MIME type check can be spoofed. Real content validation
  // requires reading file bytes to detect actual file type.
  // Reference: https://www.npmjs.com/package/file-type
  async uploadAttachment(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.addAttachment(projectId, releaseId, req.user.userId, {
      filename: file.originalname,
      filepath: `/uploads/releases/${file.filename}`,
      mimeType: file.mimetype,
      fileSize: file.size,
    });
  }

  @RequireCsrf()
  @RequirePermission('releases:update')
  @Delete(':releaseId/attachments/:attachmentId')
  async deleteAttachment(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.command.deleteAttachment(
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
    return this.notes.generateReleaseNotes(
      projectId,
      releaseId,
      req.user.userId,
    );
  }

  @RequireCsrf()
  @RequirePermission('releases:update')
  @Post(':releaseId/generate-notes')
  async generateAndSaveNotes(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.generateAndSaveReleaseNotes(
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
    return this.query.suggestNextVersion(projectId, req.user.userId, 'patch');
  }

  @RequirePermission('releases:view')
  @Get('suggest-version/:bumpType')
  async suggestVersionWithBump(
    @Param('projectId') projectId: string,
    @Param('bumpType') bumpType: 'major' | 'minor' | 'patch',
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.suggestNextVersion(projectId, req.user.userId, bumpType);
  }

  // ==================== Git Integration ====================

  @RequirePermission('releases:view')
  @Get(':releaseId/git')
  async getGitInfo(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.getGitInfo(projectId, releaseId, req.user.userId);
  }

  @RequireCsrf()
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
    return this.command.linkGit(projectId, releaseId, req.user.userId, dto);
  }

  // ==================== Deployments ====================

  @RequireCsrf()
  @RequirePermission('releases:update')
  @Post(':releaseId/deploy')
  async triggerDeploy(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: { webhookId?: string },
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.deployment.triggerDeploy(
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
    return this.query.compareReleases(
      projectId,
      releaseId,
      otherReleaseId,
      req.user.userId,
    );
  }

  @RequireCsrf()
  @RequirePermission('releases:create')
  @Post(':releaseId/rollback')
  async createRollback(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() dto: { newVersionName?: string },
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.createRollback(
      projectId,
      releaseId,
      req.user.userId,
      dto.newVersionName,
    );
  }
}

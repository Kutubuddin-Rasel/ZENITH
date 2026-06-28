// src/comments/comments.controller.ts
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
  Inject,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  COMMENT_QUERY_TOKEN,
  COMMENT_COMMAND_TOKEN,
} from './constants/comments.tokens';
import type {
  ICommentQuery,
  ICommentCommand,
  PaginatedComments,
  KeysetComments,
} from './interfaces/comments.interfaces';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { PaginationQueryDto } from './dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf';

/**
 * CommentsController - Handles comment CRUD for issues.
 *
 * CSRF Protection: Mutations require x-csrf-token header.
 * RATE LIMITING: Create limited to 10 requests/minute.
 * PAGINATION: GET supports ?page=1&limit=20 (max 100)
 */
@Controller('projects/:projectId/issues/:issueId/comments')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class CommentsController {
  constructor(
    @Inject(COMMENT_QUERY_TOKEN) private readonly query: ICommentQuery,
    @Inject(COMMENT_COMMAND_TOKEN) private readonly command: ICommentCommand,
  ) {}

  // RATE LIMITING: 10 comments per minute per client
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RequireCsrf()
  @RequirePermission('comments:create')
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: CreateCommentDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.create(projectId, issueId, req.user.userId, dto);
  }

  @RequirePermission('comments:view')
  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Query() pagination: PaginationQueryDto,
    @Request() req: { user: JwtRequestUser },
  ): Promise<PaginatedComments | KeysetComments> {
    // Opt-in keyset/seek pagination when a cursor is supplied; offset is the
    // back-compat default (preserves the existing PaginatedCommentsDto shape).
    return pagination.cursor !== undefined
      ? this.query.findAllKeyset(
          projectId,
          issueId,
          req.user.userId,
          pagination.limit,
          pagination.cursor,
        )
      : this.query.findAll(projectId, issueId, req.user.userId, {
          page: pagination.page,
          limit: pagination.limit,
        });
  }

  @RequireCsrf()
  @RequirePermission('comments:update')
  @Patch(':commentId')
  async update(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.update(
      projectId,
      issueId,
      commentId,
      req.user.userId,
      dto,
    );
  }

  @RequireCsrf()
  @RequirePermission('comments:delete')
  @Delete(':commentId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Param('commentId') commentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.command.remove(projectId, issueId, commentId, req.user.userId);
    return { message: 'Comment deleted' };
  }
}

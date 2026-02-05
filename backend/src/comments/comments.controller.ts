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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { PaginationQueryDto, PaginatedCommentsDto } from './dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf/csrf.guard';

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
  constructor(private svc: CommentsService) { }

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
    return this.svc.create(projectId, issueId, req.user.userId, dto);
  }

  @RequirePermission('comments:view')
  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Query() pagination: PaginationQueryDto,
    @Request() req: { user: JwtRequestUser },
  ): Promise<PaginatedCommentsDto> {
    return this.svc.findAll(projectId, issueId, req.user.userId, pagination);
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
    return this.svc.update(projectId, issueId, commentId, req.user.userId, dto);
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
    await this.svc.remove(projectId, issueId, commentId, req.user.userId);
    return { message: 'Comment deleted' };
  }
}

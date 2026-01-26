// src/comments/comments.controller.ts
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
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';

@Controller('projects/:projectId/issues/:issueId/comments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommentsController {
  constructor(private svc: CommentsService) {}

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
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.findAll(projectId, issueId, req.user.userId);
  }

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

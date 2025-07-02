// src/backlog/backlog.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BacklogService } from './backlog.service';
import { MoveBacklogItemDto } from './dto/move-backlog-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';

@Controller('projects/:projectId/backlog')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BacklogController {
  constructor(private backlogSvc: BacklogService) {}

  /** View backlog */
  @RequirePermission('backlog:view')
  @Get()
  async getBacklog(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.backlogSvc.getBacklog(projectId, req.user.userId);
  }

  /** Reorder backlog items */
  @RequirePermission('backlog:update')
  @Post('move')
  async move(
    @Param('projectId') projectId: string,
    @Body() dto: MoveBacklogItemDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.backlogSvc.moveItem(projectId, req.user.userId, dto);
  }
}

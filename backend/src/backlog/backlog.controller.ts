// src/backlog/backlog.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BacklogService } from './backlog.service';
import { MoveBacklogItemDto } from './dto/move-backlog-item.dto';
import { ReorderBacklogItemsDto } from './dto/reorder-backlog-items.dto';
import { BacklogQueryDto } from './dto/backlog-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf/csrf.guard';

/**
 * BacklogController - Manages backlog item ordering
 *
 * CSRF Protection: All mutations require x-csrf-token header.
 * Attack Vector: "Silent Sabotage" - priority manipulation via malicious site.
 */
@Controller('projects/:projectId/backlog')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class BacklogController {
  constructor(private backlogSvc: BacklogService) { }

  /**
   * View backlog with pagination (GET - no CSRF required)
   */
  @RequirePermission('backlog:view')
  @Get()
  async getBacklog(
    @Param('projectId') projectId: string,
    @Query() query: BacklogQueryDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.backlogSvc.getBacklog(projectId, req.user.userId, query);
  }

  /**
   * Move single backlog item
   * CSRF Required: Prevents "Silent Sabotage" attacks
   */
  @RequireCsrf()
  @RequirePermission('backlog:update')
  @Post('move')
  async move(
    @Param('projectId') projectId: string,
    @Body() dto: MoveBacklogItemDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.backlogSvc.moveItem(projectId, req.user.userId, dto);
  }

  /**
   * Bulk reorder backlog items
   * CSRF Required: High-impact mutation - full priority manipulation
   */
  @RequireCsrf()
  @RequirePermission('backlog:update')
  @Post('reorder')
  async reorder(
    @Param('projectId') projectId: string,
    @Body() dto: ReorderBacklogItemsDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.backlogSvc.reorderItems(
      projectId,
      req.user.userId,
      dto.issueIds,
    );
  }
}

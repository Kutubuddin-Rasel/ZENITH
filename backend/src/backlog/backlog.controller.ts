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
  Inject,
} from '@nestjs/common';
import { MoveBacklogItemDto } from './dto/move-backlog-item.dto';
import { ReorderBacklogItemsDto } from './dto/reorder-backlog-items.dto';
import { BacklogQueryDto } from './dto/backlog-query.dto';
import {
  BACKLOG_QUERY_TOKEN,
  BACKLOG_ORDERING_TOKEN,
} from './constants/backlog.tokens';
import type {
  IBacklogQuery,
  IBacklogOrdering,
} from './interfaces/backlog.interfaces';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf';

/**
 * BacklogController - Manages backlog item ordering
 *
 * CSRF Protection: All mutations require x-csrf-token header.
 * Attack Vector: "Silent Sabotage" - priority manipulation via malicious site.
 *
 * Step 3: injects the ISP tokens (`IBacklogQuery` / `IBacklogOrdering`)
 * instead of the concrete `BacklogService` (now deleted) — the controller
 * depends only on the sealed contract surface.
 */
@Controller('projects/:projectId/backlog')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class BacklogController {
  constructor(
    @Inject(BACKLOG_QUERY_TOKEN)
    private readonly backlogQuery: IBacklogQuery,
    @Inject(BACKLOG_ORDERING_TOKEN)
    private readonly backlogOrdering: IBacklogOrdering,
  ) {}

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
    return this.backlogQuery.getBacklog(projectId, req.user.userId, query);
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
    return this.backlogOrdering.moveItem(projectId, req.user.userId, dto);
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
    return this.backlogOrdering.reorderItems(
      projectId,
      req.user.userId,
      dto.issueIds,
    );
  }
}

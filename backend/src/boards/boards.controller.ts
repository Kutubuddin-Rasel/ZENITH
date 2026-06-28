// src/boards/boards.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequireCsrf, StatefulCsrfGuard } from '../security/csrf';

import {
  BOARD_COLUMN_COMMAND_TOKEN,
  BOARD_COMMAND_TOKEN,
  BOARD_ORDERING_COMMAND_TOKEN,
  BOARD_QUERY_TOKEN,
} from './constants/boards.tokens';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import type {
  IBoardColumnCommand,
  IBoardCommand,
  IBoardOrderingCommand,
  IBoardQuery,
} from './interfaces/boards.interfaces';

/**
 * Boards HTTP transport.
 *
 * SOLID Refactor (Step 3 commit 6): the controller injects the four
 * ISP-segregated tokens instead of the concrete `BoardsService` god
 * class. Each route's dependency surface is now precisely the
 * interface it needs — read routes touch `IBoardQuery`, lifecycle
 * routes touch `IBoardCommand`, column sub-aggregate routes touch
 * `IBoardColumnCommand`, drag-and-drop routes touch
 * `IBoardOrderingCommand`. The four bindings happen to resolve to
 * distinct service instances after the Step 3 decomposition, but
 * the controller doesn't know or care — it depends only on the
 * abstract contracts.
 *
 * Auth/Org plumbing simplification: pre-Step-3 the controller made
 * an extra round-trip through `UsersService.findOneById` on every
 * request to fetch the user's `organizationId`. That field is
 * already on the JWT (`JwtRequestUser.organizationId`), so the
 * lookup is dead weight and the dependency on `UsersService` is
 * removed. A private helper `extractOrg(req)` keeps the access
 * pattern uniform across routes.
 */
@Controller('projects/:projectId/boards')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class BoardsController {
  constructor(
    @Inject(BOARD_QUERY_TOKEN)
    private readonly query: IBoardQuery,
    @Inject(BOARD_COMMAND_TOKEN)
    private readonly command: IBoardCommand,
    @Inject(BOARD_COLUMN_COMMAND_TOKEN)
    private readonly columnCommand: IBoardColumnCommand,
    @Inject(BOARD_ORDERING_COMMAND_TOKEN)
    private readonly ordering: IBoardOrderingCommand,
  ) {}

  private extractOrg(req: { user: JwtRequestUser }): string | undefined {
    return req.user.organizationId;
  }

  @RequirePermission('boards:create')
  @RequireCsrf()
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateBoardDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.create(
      projectId,
      req.user.userId,
      dto,
      this.extractOrg(req),
    );
  }

  /**
   * CACHED: List all boards in a project
   * Uses 5-second micro-cache to prevent standup refresh storms.
   */
  @RequirePermission('boards:view')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(5000)
  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.findAll(projectId, req.user.userId, this.extractOrg(req));
  }

  /**
   * CACHED: Get single board by ID
   */
  @RequirePermission('boards:view')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(5000)
  @Get(':boardId')
  async findOne(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.findOne(
      projectId,
      boardId,
      req.user.userId,
      this.extractOrg(req),
    );
  }

  /**
   * OPTIMIZED + CACHED: Get board with slim issues.
   * This is the PRIMARY endpoint for Kanban board views.
   */
  @RequirePermission('boards:view')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(5000)
  @Get(':boardId/slim')
  async findOneSlim(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.query.findOneWithIssues(
      projectId,
      boardId,
      req.user.userId,
      this.extractOrg(req),
    );
  }

  @RequirePermission('boards:update')
  @RequireCsrf()
  @Patch(':boardId')
  async update(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() dto: UpdateBoardDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.command.update(
      projectId,
      boardId,
      req.user.userId,
      dto,
      this.extractOrg(req),
    );
  }

  @RequirePermission('boards:delete')
  @RequireCsrf()
  @Delete(':boardId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.command.remove(
      projectId,
      boardId,
      req.user.userId,
      this.extractOrg(req),
    );
    return { message: 'Board deleted' };
  }

  // Columns

  @RequirePermission('columns:create')
  @RequireCsrf()
  @Post(':boardId/columns')
  async addColumn(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() dto: CreateColumnDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.columnCommand.addColumn(
      projectId,
      boardId,
      req.user.userId,
      dto,
      this.extractOrg(req),
    );
  }

  @RequirePermission('columns:update')
  @RequireCsrf()
  @Patch(':boardId/columns/:columnId')
  async updateColumn(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateColumnDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.columnCommand.updateColumn(
      projectId,
      boardId,
      columnId,
      req.user.userId,
      dto,
      this.extractOrg(req),
    );
  }

  @RequirePermission('columns:delete')
  @RequireCsrf()
  @Delete(':boardId/columns/:columnId')
  async removeColumn(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.columnCommand.removeColumn(
      projectId,
      boardId,
      columnId,
      req.user.userId,
      this.extractOrg(req),
    );
    return { message: 'Column deleted' };
  }

  /**
   * Move an issue between columns (drag-and-drop).
   * RELATIONAL STATUS: accepts `statusId` (UUID) — column-name
   * strings are no longer accepted at the transport layer.
   */
  @RequirePermission('boards:update')
  @RequireCsrf()
  @Patch(':boardId/move-issue')
  async moveIssue(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body()
    body: {
      issueId: string;
      statusId: string;
      newOrder: number;
    },
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.ordering.moveIssue(
      projectId,
      boardId,
      body.issueId,
      body.statusId,
      body.newOrder,
      req.user.userId,
      this.extractOrg(req),
    );
    return { message: 'Issue moved' };
  }

  /** Reorder issues within a column (drag-and-drop) */
  @RequirePermission('boards:update')
  @RequireCsrf()
  @Patch(':boardId/reorder-issues')
  async reorderIssues(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() body: { columnId: string; orderedIssueIds: string[] },
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.ordering.reorderIssues(
      projectId,
      boardId,
      body.columnId,
      body.orderedIssueIds,
      req.user.userId,
      this.extractOrg(req),
    );
    return { message: 'Issues reordered' };
  }

  /** OPTIMIZED: Bulk reorder columns (replaces N individual calls) */
  @RequirePermission('columns:update')
  @RequireCsrf()
  @Patch(':boardId/reorder-columns')
  async reorderColumns(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() body: { orderedColumnIds: string[] },
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.ordering.reorderColumns(
      projectId,
      boardId,
      body.orderedColumnIds,
      req.user.userId,
      this.extractOrg(req),
    );
    return { message: 'Columns reordered' };
  }
}

// src/boards/boards.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  Request,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { BoardsService } from './boards.service';
import { UsersService } from '../users/users.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf/csrf.guard';

@Controller('projects/:projectId/boards')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class BoardsController {
  constructor(
    private svc: BoardsService,
    private readonly usersService: UsersService,
  ) { }

  /**
   * Helper: Get user's organization ID
   */
  private async getUserOrganization(
    userId: string,
  ): Promise<string | undefined> {
    const user = await this.usersService.findOneById(userId);
    return user.organizationId;
  }

  @RequirePermission('boards:create')
  @RequireCsrf()
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateBoardDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.svc.create(projectId, req.user.userId, dto, orgId);
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
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.svc.findAll(projectId, req.user.userId, orgId);
  }

  /**
   * CACHED: Get single board by ID
   * Uses 5-second micro-cache to prevent duplicate queries.
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
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.svc.findOne(projectId, boardId, req.user.userId, orgId);
  }

  /**
   * OPTIMIZED + CACHED: Get board with slim issues
   *
   * Returns board + columns + issues with selective fields only.
   * Excludes heavy fields: description, metadata, embedding.
   * Uses 5-second micro-cache for standup refresh storms.
   *
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
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.svc.findOneWithIssues(
      projectId,
      boardId,
      req.user.userId,
      orgId,
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
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.svc.update(projectId, boardId, req.user.userId, dto, orgId);
  }

  @RequirePermission('boards:delete')
  @RequireCsrf()
  @Delete(':boardId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    await this.svc.remove(projectId, boardId, req.user.userId, orgId);
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
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.svc.addColumn(projectId, boardId, req.user.userId, dto, orgId);
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
    const orgId = await this.getUserOrganization(req.user.userId);
    return this.svc.updateColumn(
      projectId,
      boardId,
      columnId,
      req.user.userId,
      dto,
      orgId,
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
    const orgId = await this.getUserOrganization(req.user.userId);
    await this.svc.removeColumn(
      projectId,
      boardId,
      columnId,
      req.user.userId,
      orgId,
    );
    return { message: 'Column deleted' };
  }

  /**
   * Move an issue between columns (drag-and-drop)
   * RELATIONAL STATUS: Now accepts statusId (UUID) instead of column name strings.
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
      statusId: string; // The target WorkflowStatus UUID
      newOrder: number;
    },
    @Request() req: { user: JwtRequestUser },
  ) {
    const orgId = await this.getUserOrganization(req.user.userId);
    await this.svc.moveIssue(
      projectId,
      boardId,
      body.issueId,
      body.statusId,
      body.newOrder,
      req.user.userId,
      orgId,
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
    const orgId = await this.getUserOrganization(req.user.userId);
    await this.svc.reorderIssues(
      projectId,
      boardId,
      body.columnId,
      body.orderedIssueIds,
      req.user.userId,
      orgId,
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
    const orgId = await this.getUserOrganization(req.user.userId);
    await this.svc.reorderColumns(
      projectId,
      boardId,
      body.orderedColumnIds,
      req.user.userId,
      orgId,
    );
    return { message: 'Columns reordered' };
  }
}

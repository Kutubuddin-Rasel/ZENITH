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
  Request,
} from '@nestjs/common';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';

@Controller('projects/:projectId/boards')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BoardsController {
  constructor(private svc: BoardsService) {}

  @RequirePermission('boards:create')
  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateBoardDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.create(projectId, req.user.userId, dto);
  }

  @RequirePermission('boards:view')
  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.findAll(projectId, req.user.userId);
  }

  @RequirePermission('boards:view')
  @Get(':boardId')
  async findOne(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.findOne(projectId, boardId, req.user.userId);
  }

  @RequirePermission('boards:update')
  @Patch(':boardId')
  async update(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() dto: UpdateBoardDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.update(projectId, boardId, req.user.userId, dto);
  }

  @RequirePermission('boards:delete')
  @Delete(':boardId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.remove(projectId, boardId, req.user.userId);
    return { message: 'Board deleted' };
  }

  // Columns

  @RequirePermission('columns:create')
  @Post(':boardId/columns')
  async addColumn(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() dto: CreateColumnDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.addColumn(projectId, boardId, req.user.userId, dto);
  }

  @RequirePermission('columns:update')
  @Patch(':boardId/columns/:columnId')
  async updateColumn(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateColumnDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.updateColumn(
      projectId,
      boardId,
      columnId,
      req.user.userId,
      dto,
    );
  }

  @RequirePermission('columns:delete')
  @Delete(':boardId/columns/:columnId')
  async removeColumn(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.removeColumn(projectId, boardId, columnId, req.user.userId);
    return { message: 'Column deleted' };
  }

  /** Move an issue between columns (drag-and-drop) */
  @RequirePermission('boards:update')
  @Patch(':boardId/move-issue')
  async moveIssue(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body()
    body: {
      issueId: string;
      fromColumn: string;
      toColumn: string;
      newOrder: number;
    },
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.moveIssue(
      projectId,
      boardId,
      body.issueId,
      body.fromColumn,
      body.toColumn,
      body.newOrder,
      req.user.userId,
    );
    return { message: 'Issue moved' };
  }

  /** Reorder issues within a column (drag-and-drop) */
  @RequirePermission('boards:update')
  @Patch(':boardId/reorder-issues')
  async reorderIssues(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() body: { columnId: string; orderedIssueIds: string[] },
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.reorderIssues(
      projectId,
      boardId,
      body.columnId,
      body.orderedIssueIds,
      req.user.userId,
    );
    return { message: 'Issues reordered' };
  }
}

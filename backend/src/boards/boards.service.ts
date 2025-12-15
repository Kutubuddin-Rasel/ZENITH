// src/boards/boards.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Board, BoardType } from './entities/board.entity';
import { BoardColumn } from './entities/board-column.entity';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { BoardsGateway } from './boards.gateway';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(Board)
    private boardRepo: Repository<Board>,
    @InjectRepository(BoardColumn)
    private colRepo: Repository<BoardColumn>,
    @Inject(forwardRef(() => ProjectsService))
    private projectsService: ProjectsService,
    private membersService: ProjectMembersService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
    private boardsGateway: BoardsGateway,
  ) { }

  /** Create a new board (and seed default columns) */
  async create(
    projectId: string,
    userId: string,
    dto: CreateBoardDto,
    organizationId?: string,
  ): Promise<Board> {
    await this.projectsService.findOneById(projectId, organizationId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can create boards');
    }

    const { columns, ...boardData } = dto;
    const board = this.boardRepo.create({ projectId, ...boardData });
    const saved = await this.boardRepo.save(board);

    let cols: BoardColumn[] = [];

    if (columns && columns.length > 0) {
      cols = columns.map((col: { name: string; order: number }) =>
        this.colRepo.create({
          boardId: saved.id,
          name: col.name, // Linear-style: column name IS the status
          columnOrder: col.order,
        }),
      );
    } else {
      // seed default columns
      const defaults = {
        [BoardType.KANBAN]: ['To Do', 'In Progress', 'Done'],
        [BoardType.SCRUM]: [
          'Backlog',
          'Selected for Development',
          'In Progress',
          'Done',
        ],
      }[saved.type];
      cols = defaults.map((name, idx) =>
        this.colRepo.create({
          boardId: saved.id,
          name, // Linear-style: column name IS the status
          columnOrder: idx,
        }),
      );
    }

    await this.colRepo.save(cols);
    saved.columns = cols;

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `created board ${saved.name} `,
      actorId: userId,
      boardName: saved.name,
    });

    return saved;
  }

  /** List all boards for a project */
  async findAll(
    projectId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Board[]> {
    if (organizationId) {
      await this.projectsService.findOneById(projectId, organizationId);
    }
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
    return this.boardRepo.find({
      where: { projectId },
      relations: ['columns'],
    });
  }

  /** Get one board */
  async findOne(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Board> {
    const board = await this.boardRepo.findOne({
      where: { id: boardId, projectId },
      relations: ['columns', 'project'],
    });
    if (!board) throw new NotFoundException('Board not found');

    // Validate organization access
    if (organizationId && board.project.organizationId !== organizationId) {
      throw new NotFoundException('Board not found');
    }

    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
    board.columns.sort((a, b) => a.columnOrder - b.columnOrder);
    return board;
  }

  /** Update board metadata */
  async update(
    projectId: string,
    boardId: string,
    userId: string,
    dto: UpdateBoardDto,
    organizationId?: string,
  ): Promise<Board> {
    const board = await this.findOne(
      projectId,
      boardId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can update boards');
    }
    Object.assign(board, dto);
    const updated = await this.boardRepo.save(board);

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `updated board ${updated.name} `,
      actorId: userId,
      boardName: updated.name,
    });

    return updated;
  }

  /** Delete a board */
  async remove(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    const board = await this.findOne(
      projectId,
      boardId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can delete boards');
    }
    await this.boardRepo.remove(board);

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `deleted board ${board.name} `,
      actorId: userId,
      boardName: board.name,
    });
  }

  /** Add a column */
  async addColumn(
    projectId: string,
    boardId: string,
    userId: string,
    dto: CreateColumnDto,
    organizationId?: string,
  ): Promise<BoardColumn> {
    const board = await this.findOne(
      projectId,
      boardId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can add columns');
    }
    const col = this.colRepo.create({ boardId, ...dto });
    const saved = await this.colRepo.save(col);

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `added column ${saved.name} to board ${board.name} `,
      actorId: userId,
      boardName: board.name,
      columnName: saved.name,
    });

    return saved;
  }

  /** Update a column */
  async updateColumn(
    projectId: string,
    boardId: string,
    colId: string,
    userId: string,
    dto: UpdateColumnDto,
    organizationId?: string,
  ): Promise<BoardColumn> {
    const board = await this.findOne(
      projectId,
      boardId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can update columns');
    }
    const col = await this.colRepo.findOneBy({ id: colId, boardId });
    if (!col) throw new NotFoundException('Column not found');
    Object.assign(col, dto);
    const updated = await this.colRepo.save(col);

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `updated column ${updated.name} `,
      actorId: userId,
      boardName: board.name,
      columnName: updated.name,
    });

    return updated;
  }

  /** Delete a column */
  async removeColumn(
    projectId: string,
    boardId: string,
    colId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    const board = await this.findOne(
      projectId,
      boardId,
      userId,
      organizationId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can remove columns');
    }
    const col = await this.colRepo.findOneBy({ id: colId, boardId });
    if (!col) throw new NotFoundException('Column not found');
    await this.colRepo.remove(col);

    this.eventEmitter.emit('board.event', {
      projectId,
      issueId: null,
      action: `deleted column ${col.name} from board`,
      actorId: userId,
      boardName: board.name,
      columnName: col.name,
    });
  }

  /**
   * OPTIMIZED: Bulk reorder columns in single request
   * Frontend currently makes N API calls to update column order - this reduces to 1
   */
  async reorderColumns(
    projectId: string,
    boardId: string,
    orderedColumnIds: string[],
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    await this.findOne(projectId, boardId, userId, organizationId);

    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can reorder columns');
    }

    if (orderedColumnIds.length === 0) return;

    // Single bulk update with CASE statement
    const caseStatements = orderedColumnIds
      .map((id, idx) => `WHEN '${id}' THEN ${idx} `)
      .join(' ');

    await this.colRepo.query(
      `UPDATE board_columns 
       SET "order" = CASE id ${caseStatements} END
       WHERE id = ANY($1) 
       AND "boardId" = $2`,
      [orderedColumnIds, boardId],
    );

    // Emit real-time event
    this.boardsGateway.emitColumnsReordered({
      projectId,
      boardId,
      orderedColumnIds,
    });
  }

  /** Move an issue between columns (drag-and-drop) */
  async moveIssue(
    projectId: string,
    boardId: string,
    issueId: string,
    fromColumn: string,
    toColumn: string,
    newOrder: number,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    // Permission checks (reuse existing logic as needed)
    await this.findOne(projectId, boardId, userId, organizationId);
    // Update the issue's status/column and order
    // (Assume Issue entity has status and backlogOrder fields)
    const issueRepo = this.dataSource.getRepository('Issue');
    const issue = (await issueRepo.findOneBy({ id: issueId, projectId })) as {
      id: string;
      status: string;
      backlogOrder: number;
    } | null;
    if (!issue) throw new NotFoundException('Issue not found');
    const prevStatus = issue.status;
    issue.status = toColumn;
    issue.backlogOrder = newOrder;
    await issueRepo.save(issue);
    // Emit real-time event
    this.boardsGateway.emitIssueMoved({
      projectId,
      boardId,
      issueId,
      fromColumn: prevStatus,
      toColumn,
      newOrder,
    });
  }

  /**
   * OPTIMIZED: Reorder issues within a column using single bulk UPDATE
   * Uses CASE statement to update all issues in one query instead of N queries
   */
  async reorderIssues(
    projectId: string,
    boardId: string,
    columnId: string,
    orderedIssueIds: string[],
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    await this.findOne(projectId, boardId, userId, organizationId);

    if (orderedIssueIds.length === 0) return;

    // OPTIMIZED: Single bulk update with CASE statement
    // This replaces N update queries with 1 query
    const caseStatements = orderedIssueIds
      .map((id, idx) => `WHEN '${id}' THEN ${idx} `)
      .join(' ');

    await this.dataSource.query(
      `UPDATE issues 
       SET "backlogOrder" = CASE id ${caseStatements} END
       WHERE id = ANY($1) 
       AND "projectId" = $2 
       AND status = $3`,
      [orderedIssueIds, projectId, columnId],
    );

    // Emit real-time event
    this.boardsGateway.emitIssueReordered({
      projectId,
      boardId,
      columnId,
      issues: orderedIssueIds,
    });
  }
}

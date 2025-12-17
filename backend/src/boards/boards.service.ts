// src/boards/boards.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Board, BoardType } from './entities/board.entity';
import { BoardColumn } from './entities/board-column.entity';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
// REFACTORED: Using direct repository instead of ProjectsService
import { Project } from '../projects/entities/project.entity';
import { Issue } from '../issues/entities/issue.entity';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { BoardsGateway } from './boards.gateway';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '../cache/cache.service';
import { WorkflowStatus } from '../workflows/entities/workflow-status.entity';

@Injectable()
export class BoardsService {
  private readonly logger = new Logger(BoardsService.name);

  constructor(
    @InjectRepository(Board)
    private boardRepo: Repository<Board>,
    @InjectRepository(BoardColumn)
    private colRepo: Repository<BoardColumn>,
    // REFACTORED: Direct repository injection instead of forwardRef to ProjectsService
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(Issue)
    private issueRepo: Repository<Issue>,
    private membersService: ProjectMembersService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
    private boardsGateway: BoardsGateway,
    private cacheService: CacheService,
  ) { }

  /** Create a new board (and seed default columns) */
  async create(
    projectId: string,
    userId: string,
    dto: CreateBoardDto,
    organizationId?: string,
  ): Promise<Board> {
    // REFACTORED: Direct repo query instead of projectsService.findOneById
    const project = await this.projectRepo.findOne({
      where: { id: projectId, ...(organizationId && { organizationId }) },
    });
    if (!project) throw new NotFoundException('Project not found');
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can create boards');
    }

    const { columns, ...boardData } = dto;
    const board = this.boardRepo.create({ projectId, ...boardData });
    const saved = await this.boardRepo.save(board);

    let cols: BoardColumn[] = [];

    if (columns && columns.length > 0) {
      cols = columns.map(
        (col: { name: string; order: number; statusId?: string }) =>
          this.colRepo.create({
            boardId: saved.id,
            name: col.name,
            columnOrder: col.order,
            statusId: col.statusId, // Link to WorkflowStatus
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
    // REFACTORED: Validate organization access with direct repo
    if (organizationId) {
      const project = await this.projectRepo.findOne({
        where: { id: projectId, organizationId },
      });
      if (!project) throw new NotFoundException('Project not found');
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

  /**
   * OPTIMIZED: Get board with columns and issues using selective field loading
   *
   * Performance optimizations:
   * 1. SELECT only essential issue fields (excludes description, metadata, embedding)
   * 2. 5-second micro-cache to handle standup refresh storms
   * 3. Single query with left joins instead of N+1
   *
   * @returns Board with columns, each column has issues with slim fields
   */
  async findOneWithIssues(
    projectId: string,
    boardId: string,
    userId: string,
    organizationId?: string,
  ): Promise<{
    board: Board;
    columns: Array<{
      id: string;
      name: string;
      statusId: string | null;
      columnOrder: number;
      issues: Array<{
        id: string;
        title: string;
        type: string;
        priority: string;
        assigneeId: string | null;
        storyPoints: number;
        status: string;
        statusId: string | null;
        backlogOrder: number;
      }>;
    }>;
  }> {
    // === CACHE CHECK ===
    const cacheKey = `board:${boardId}:slim`;
    const cached = await this.cacheService.get<{
      board: Board;
      columns: Array<any>;
    }>(cacheKey, { namespace: 'boards' });

    if (cached) {
      this.logger.debug(`Cache HIT for board ${boardId}`);
      return cached;
    }

    // === AUTHORIZATION ===
    const board = await this.boardRepo.findOne({
      where: { id: boardId, projectId },
      relations: ['columns', 'project'],
    });
    if (!board) throw new NotFoundException('Board not found');

    // Validate organization access (tenant isolation)
    if (organizationId && board.project.organizationId !== organizationId) {
      throw new NotFoundException('Board not found');
    }

    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');

    // === OPTIMIZED QUERY ===
    // Fetch issues with ONLY the fields needed for Kanban board display
    // EXCLUDES: description, metadata, embedding, history (can be huge)
    // RELATIONAL STATUS: Select statusId for proper ID-based matching
    const issues = await this.issueRepo
      .createQueryBuilder('issue')
      .select([
        'issue.id',
        'issue.title',
        'issue.type',
        'issue.priority',
        'issue.assigneeId',
        'issue.storyPoints',
        'issue.status',
        'issue.statusId',
        'issue.backlogOrder',
      ])
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('issue.isArchived = false')
      .orderBy('issue.backlogOrder', 'ASC')
      .getMany();

    // === GROUP ISSUES BY COLUMN ===
    // RELATIONAL STATUS: Primary matching by statusId, fallback to string for legacy data
    const issuesByColumnId = new Map<string, typeof issues>();
    const issuesByColumnName = new Map<string, typeof issues>(); // Fallback for legacy

    for (const col of board.columns) {
      if (col.statusId) {
        issuesByColumnId.set(col.statusId, []);
      }
      issuesByColumnName.set(col.name, []);
    }

    for (const issue of issues) {
      let matched = false;
      // Primary: Match by statusId (source of truth)
      if (issue.statusId) {
        const colIssues = issuesByColumnId.get(issue.statusId);
        if (colIssues) {
          colIssues.push(issue);
          matched = true;
        }
      }
      // Fallback: Match by status string (legacy data)
      if (!matched) {
        const colIssues = issuesByColumnName.get(issue.status);
        if (colIssues) {
          colIssues.push(issue);
        }
      }
    }

    // === BUILD RESPONSE ===
    const sortedColumns = board.columns
      .sort((a, b) => a.columnOrder - b.columnOrder)
      .map((col) => {
        // Get issues: prefer by statusId, fallback to by name
        const colIssues = col.statusId
          ? issuesByColumnId.get(col.statusId) || []
          : issuesByColumnName.get(col.name) || [];
        return {
          id: col.id,
          name: col.name,
          statusId: col.statusId || null,
          columnOrder: col.columnOrder,
          issues: colIssues.map((i) => ({
            id: i.id,
            title: i.title,
            type: String(i.type),
            priority: String(i.priority),
            assigneeId: i.assigneeId ?? null,
            storyPoints: i.storyPoints,
            status: i.status,
            statusId: i.statusId || null,
            backlogOrder: i.backlogOrder,
          })),
        };
      });

    const result = {
      board: {
        id: board.id,
        name: board.name,
        type: board.type,
        projectId: board.projectId,
        isActive: board.isActive,
      } as Board,
      columns: sortedColumns,
    };

    // === MICRO-CACHE: 5 seconds ===
    // Short TTL survives standup refresh storms without needing invalidation
    await this.cacheService.set(cacheKey, result, {
      ttl: 5,
      namespace: 'boards',
      tags: [`board:${boardId}`, `project:${projectId}`],
    });

    this.logger.debug(`Cache SET for board ${boardId} (TTL: 5s)`);
    return result;
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

  /**
   * Move an issue between columns (drag-and-drop)
   * RELATIONAL STATUS: Accepts toStatusId (UUID) instead of column name string.
   * Updates both statusId (source of truth) and legacy status string for backward compat.
   */
  async moveIssue(
    projectId: string,
    boardId: string,
    issueId: string,
    toStatusId: string,
    newOrder: number,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    // Permission checks
    await this.findOne(projectId, boardId, userId, organizationId);

    // RELATIONAL STATUS: Fetch WorkflowStatus to get the name for legacy sync
    const workflowStatusRepo = this.dataSource.getRepository(WorkflowStatus);
    const workflowStatus = await workflowStatusRepo.findOne({
      where: { id: toStatusId, projectId },
    });

    if (!workflowStatus) {
      throw new NotFoundException(
        `WorkflowStatus not found: ${toStatusId}. Cannot update issue status.`,
      );
    }

    // Fetch and update issue
    const issueRepo = this.dataSource.getRepository(Issue);
    const issue = await issueRepo.findOne({
      where: { id: issueId, projectId },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    const prevStatusId = issue.statusId;
    const prevStatus = issue.status;

    // Update both statusId (source of truth) and legacy status string
    issue.statusId = toStatusId;
    issue.status = workflowStatus.name; // Legacy sync
    issue.backlogOrder = newOrder;

    await issueRepo.save(issue);

    // Emit real-time event with both old and new identifiers
    this.boardsGateway.emitIssueMoved({
      projectId,
      boardId,
      issueId,
      fromStatusId: prevStatusId,
      toStatusId,
      fromColumn: prevStatus, // Legacy compat
      toColumn: workflowStatus.name, // Legacy compat
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

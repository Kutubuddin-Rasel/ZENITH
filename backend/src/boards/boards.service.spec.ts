import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

import { BoardsService } from './boards.service';
import { Board, BoardType } from './entities/board.entity';
import { BoardColumn } from './entities/board-column.entity';
import { Project } from '../projects/entities/project.entity';
import { Issue } from '../issues/entities/issue.entity';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { BoardsGateway } from './boards.gateway';
import { CacheService } from '../cache/cache.service';
import { ProjectRole } from '../membership/enums/project-role.enum';

// Helper types for strict mocking
type MockRepository<T = any> = {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  findOneBy: jest.Mock;
  remove: jest.Mock;
  query: jest.Mock;
  createQueryBuilder: jest.Mock;
};

describe('BoardsService', () => {
  let service: BoardsService;
  let boardRepo: MockRepository<Board>;
  let columnRepo: MockRepository<BoardColumn>;
  let projectRepo: MockRepository<Project>;
  let issueRepo: MockRepository<Issue>;

  // Explicit service mocks
  let mockMembersService: {
    getUserRole: jest.Mock;
  };
  let mockCacheService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let mockBoardsGateway: {
    emitColumnsReordered: jest.Mock;
    emitIssueMoved: jest.Mock;
    emitIssueReordered: jest.Mock;
  };
  let mockEventEmitter: {
    emit: jest.Mock;
  };
  let mockDataSource: {
    getRepository: jest.Mock;
    query: jest.Mock;
  };

  // Test fixtures
  const mockProject: Partial<Project> = {
    id: 'project-123',
    key: 'ZEN',
    name: 'Zenith Project',
    organizationId: 'org-123',
  };

  const mockColumn: Partial<BoardColumn> = {
    id: 'column-123',
    boardId: 'board-123',
    name: 'To Do',
    columnOrder: 0,
    // Add missing property if needed for stricter typing in source
    statusId: undefined,
  };

  const mockBoard: Partial<Board> = {
    id: 'board-123',
    projectId: 'project-123',
    name: 'Main Board',
    type: BoardType.KANBAN,
    isActive: true,
    columns: [mockColumn as BoardColumn],
    project: mockProject as Project,
  };

  const mockIssue: Partial<Issue> = {
    id: 'issue-123',
    projectId: 'project-123',
    title: 'Test Issue',
    status: 'To Do',
    statusId: 'status-123',
    type: 'Task' as any,
    priority: 'Medium' as any,
    storyPoints: 5,
    backlogOrder: 0,
    isArchived: false,
  };

  beforeEach(async () => {
    // Create mock repositories
    const createMockRepository = <T>(): MockRepository<T> => ({
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      remove: jest.fn(),
      query: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockIssue]),
      })),
    });

    mockMembersService = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    };

    mockCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true),
    };

    mockBoardsGateway = {
      emitColumnsReordered: jest.fn(),
      emitIssueMoved: jest.fn(),
      emitIssueReordered: jest.fn(),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockDataSource = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue({
          id: 'status-123',
          name: 'In Progress',
          projectId: 'project-123',
        }),
        save: jest.fn(),
      }),
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardsService,
        {
          provide: getRepositoryToken(Board),
          useValue: createMockRepository<Board>(),
        },
        {
          provide: getRepositoryToken(BoardColumn),
          useValue: createMockRepository<BoardColumn>(),
        },
        {
          provide: getRepositoryToken(Project),
          useValue: createMockRepository<Project>(),
        },
        {
          provide: getRepositoryToken(Issue),
          useValue: createMockRepository<Issue>(),
        },
        { provide: ProjectMembersService, useValue: mockMembersService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: BoardsGateway, useValue: mockBoardsGateway },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<BoardsService>(BoardsService);
    boardRepo = module.get(getRepositoryToken(Board));
    columnRepo = module.get(getRepositoryToken(BoardColumn));
    projectRepo = module.get(getRepositoryToken(Project));
    issueRepo = module.get(getRepositoryToken(Issue));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  // CREATE TESTS
  // ===========================================
  describe('create', () => {
    const createDto = {
      name: 'Sprint Board',
      type: BoardType.SCRUM,
    };

    beforeEach(() => {
      projectRepo.findOne.mockResolvedValue(mockProject as Project);
      boardRepo.create.mockImplementation(
        (dto) => ({ ...dto, id: 'new-board' }) as Board,
      );
      boardRepo.save.mockImplementation((board) =>
        Promise.resolve({ ...board, id: 'new-board' } as Board),
      );
      columnRepo.create.mockImplementation((dto) => dto as BoardColumn);
      columnRepo.save.mockImplementation((cols) =>
        Promise.resolve(cols as BoardColumn[]),
      );
    });

    it('should create a board with default columns for KANBAN', async () => {
      const kanbanDto = { ...createDto, type: BoardType.KANBAN };
      boardRepo.save.mockResolvedValueOnce({
        ...kanbanDto,
        id: 'new-board',
      } as Board);

      const result = await service.create('project-123', 'user-123', kanbanDto);

      expect(result).toBeDefined();
      expect(boardRepo.create).toHaveBeenCalledWith({
        projectId: 'project-123',
        name: 'Sprint Board',
        type: BoardType.KANBAN,
      });

      // Should create 3 default columns for Kanban: To Do, In Progress, Done
      expect(columnRepo.create).toHaveBeenCalledTimes(3);
    });

    it('should create a board with default columns for SCRUM', async () => {
      boardRepo.save.mockResolvedValueOnce({
        ...createDto,
        id: 'new-board',
      } as Board);

      await service.create('project-123', 'user-123', createDto);

      // Should create 4 default columns for Scrum
      expect(columnRepo.create).toHaveBeenCalledTimes(4);
    });

    it('should use custom columns if provided', async () => {
      const dtoWithColumns = {
        ...createDto,
        columns: [
          { name: 'Custom 1', order: 0 },
          { name: 'Custom 2', order: 1 },
        ],
      };
      boardRepo.save.mockResolvedValueOnce({
        ...createDto,
        id: 'new-board',
      } as Board);

      await service.create('project-123', 'user-123', dtoWithColumns);

      expect(columnRepo.create).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException if project not found', async () => {
      projectRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.create('non-existent', 'user-123', createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if non-lead tries to create', async () => {
      mockMembersService.getUserRole.mockResolvedValueOnce(
        ProjectRole.DEVELOPER,
      );

      await expect(
        service.create('project-123', 'user-123', createDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should emit board.event after creation', async () => {
      boardRepo.save.mockResolvedValueOnce({
        ...createDto,
        id: 'new-board',
        name: 'Sprint Board',
      } as Board);

      await service.create('project-123', 'user-123', createDto);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'board.event',
        expect.objectContaining({
          boardName: 'Sprint Board',
        }),
      );
    });
  });

  // ===========================================
  // FIND ALL TESTS
  // ===========================================
  describe('findAll', () => {
    beforeEach(() => {
      projectRepo.findOne.mockResolvedValue(mockProject as Project);
      boardRepo.find.mockResolvedValue([mockBoard as Board]);
    });

    it('should return all boards for a project', async () => {
      const result = await service.findAll('project-123', 'user-123');

      expect(result).toHaveLength(1);
      expect(boardRepo.find).toHaveBeenCalledWith({
        where: { projectId: 'project-123' },
        relations: ['columns'],
      });
    });

    it('should throw ForbiddenException if user is not a project member', async () => {
      mockMembersService.getUserRole.mockResolvedValueOnce(null);

      await expect(
        service.findAll('project-123', 'non-member'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should validate organization access when provided', async () => {
      projectRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.findAll('project-123', 'user-123', 'wrong-org'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  // FIND ONE TESTS
  // ===========================================
  describe('findOne', () => {
    beforeEach(() => {
      boardRepo.findOne.mockResolvedValue(mockBoard as Board);
    });

    it('should return a board with sorted columns', async () => {
      const unsortedBoard = {
        ...mockBoard,
        columns: [
          { ...mockColumn, columnOrder: 2 },
          { ...mockColumn, id: 'col-2', columnOrder: 0 },
          { ...mockColumn, id: 'col-3', columnOrder: 1 },
        ],
      };
      boardRepo.findOne.mockResolvedValueOnce(unsortedBoard as Board);

      const result = await service.findOne(
        'project-123',
        'board-123',
        'user-123',
      );

      expect(result.columns[0].columnOrder).toBe(0);
      expect(result.columns[1].columnOrder).toBe(1);
      expect(result.columns[2].columnOrder).toBe(2);
    });

    it('should throw NotFoundException if board not found', async () => {
      boardRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.findOne('project-123', 'non-existent', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if organization mismatch', async () => {
      const boardWithDifferentOrg = {
        ...mockBoard,
        project: { ...mockProject, organizationId: 'different-org' },
      };
      boardRepo.findOne.mockResolvedValueOnce(boardWithDifferentOrg as Board);

      await expect(
        service.findOne('project-123', 'board-123', 'user-123', 'org-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a project member', async () => {
      mockMembersService.getUserRole.mockResolvedValueOnce(null);

      await expect(
        service.findOne('project-123', 'board-123', 'non-member'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================
  // FIND ONE WITH ISSUES (OPTIMIZED) TESTS
  // ===========================================
  describe('findOneWithIssues', () => {
    beforeEach(() => {
      boardRepo.findOne.mockResolvedValue({
        ...mockBoard,
        columns: [{ ...mockColumn, statusId: 'status-123' }],
      } as Board);

      const mockQb = issueRepo.createQueryBuilder();
      (mockQb.getMany as jest.Mock).mockResolvedValue([mockIssue]);
    });

    it('should return cached result if available', async () => {
      const cachedResult = { board: mockBoard, columns: [] };
      mockCacheService.get.mockResolvedValueOnce(cachedResult);

      const result = await service.findOneWithIssues(
        'project-123',
        'board-123',
        'user-123',
      );

      expect(result).toEqual(cachedResult);
      expect(boardRepo.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from DB and cache if not cached', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);

      const result = await service.findOneWithIssues(
        'project-123',
        'board-123',
        'user-123',
      );

      expect(result).toBeDefined();
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `board:board-123:slim`,
        expect.any(Object),
        expect.objectContaining({ ttl: 5 }), // 5-second micro-cache
      );
    });

    it('should group issues by statusId (relational matching)', async () => {
      const issuesWithStatus = [
        { ...mockIssue, statusId: 'status-123' },
        { ...mockIssue, id: 'issue-2', statusId: 'status-456' },
      ];

      // Fix: Override createQueryBuilder to return a mock that returns our data
      issueRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(issuesWithStatus),
      });

      const boardWithMultipleColumns = {
        ...mockBoard,
        columns: [
          { ...mockColumn, statusId: 'status-123' },
          {
            ...mockColumn,
            id: 'col-2',
            name: 'In Progress',
            statusId: 'status-456',
            columnOrder: 1,
          },
        ],
      };
      boardRepo.findOne.mockResolvedValueOnce(
        boardWithMultipleColumns as Board,
      );

      const result = await service.findOneWithIssues(
        'project-123',
        'board-123',
        'user-123',
      );

      expect(result.columns[0].issues).toHaveLength(1);
      expect(result.columns[1].issues).toHaveLength(1);
    });

    it('should fall back to status string matching for legacy data', async () => {
      const legacyIssue = { ...mockIssue, statusId: null, status: 'To Do' };

      issueRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([legacyIssue]),
      });

      const boardWithNoStatusId = {
        ...mockBoard,
        columns: [{ ...mockColumn, statusId: null }],
      };
      boardRepo.findOne.mockResolvedValueOnce(
        boardWithNoStatusId as unknown as Board,
      );

      const result = await service.findOneWithIssues(
        'project-123',
        'board-123',
        'user-123',
      );

      expect(result.columns[0].issues).toHaveLength(1);
    });
  });

  // ===========================================
  // UPDATE TESTS
  // ===========================================
  describe('update', () => {
    beforeEach(() => {
      boardRepo.findOne.mockResolvedValue(mockBoard as Board);
      boardRepo.save.mockImplementation((b) => Promise.resolve(b as Board));
    });

    it('should update board metadata', async () => {
      const result = await service.update(
        'project-123',
        'board-123',
        'user-123',
        { name: 'Updated Board' },
      );

      expect(result.name).toBe('Updated Board');
    });

    it('should throw ForbiddenException if non-lead tries to update', async () => {
      mockMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.DEVELOPER); // For update permission

      await expect(
        service.update('project-123', 'board-123', 'user-123', {
          name: 'Updated',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should emit board.event after update', async () => {
      await service.update('project-123', 'board-123', 'user-123', {
        name: 'Updated Board',
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'board.event',
        expect.any(Object),
      );
    });
  });

  // ===========================================
  // REMOVE (DELETE) TESTS
  // ===========================================
  describe('remove', () => {
    beforeEach(() => {
      boardRepo.findOne.mockResolvedValue(mockBoard as Board);
    });

    it('should delete a board', async () => {
      await service.remove('project-123', 'board-123', 'user-123');

      expect(boardRepo.remove).toHaveBeenCalledWith(mockBoard);
    });

    it('should throw ForbiddenException if non-lead tries to delete', async () => {
      mockMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.DEVELOPER); // For delete permission

      await expect(
        service.remove('project-123', 'board-123', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================
  // COLUMN OPERATIONS TESTS
  // ===========================================
  describe('addColumn', () => {
    beforeEach(() => {
      boardRepo.findOne.mockResolvedValue(mockBoard as Board);
      columnRepo.create.mockImplementation((dto) => dto as BoardColumn);
      columnRepo.save.mockImplementation((col) =>
        Promise.resolve({ ...col, id: 'new-col' } as BoardColumn),
      );
    });

    it('should add a column to the board', async () => {
      const result = await service.addColumn(
        'project-123',
        'board-123',
        'user-123',
        {
          name: 'Testing',
          columnOrder: 3,
          status: 'Testing',
        } as any,
      );

      expect(result).toBeDefined();
      expect(columnRepo.create).toHaveBeenCalledWith({
        boardId: 'board-123',
        name: 'Testing',
        columnOrder: 3,
        status: 'Testing',
      });
    });

    it('should throw ForbiddenException if non-lead tries to add column', async () => {
      mockMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.DEVELOPER); // For add permission

      await expect(
        service.addColumn('project-123', 'board-123', 'user-123', {
          name: 'New',
          columnOrder: 1,
          status: 'New',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateColumn', () => {
    beforeEach(() => {
      boardRepo.findOne.mockResolvedValue(mockBoard as Board);
      columnRepo.findOneBy.mockResolvedValue(mockColumn as BoardColumn);
      columnRepo.save.mockImplementation((col) =>
        Promise.resolve(col as BoardColumn),
      );
    });

    it('should update a column', async () => {
      const result = await service.updateColumn(
        'project-123',
        'board-123',
        'column-123',
        'user-123',
        { name: 'Updated Column' },
      );

      expect(result.name).toBe('Updated Column');
    });

    it('should throw NotFoundException if column not found', async () => {
      columnRepo.findOneBy.mockResolvedValueOnce(null);

      await expect(
        service.updateColumn(
          'project-123',
          'board-123',
          'non-existent',
          'user-123',
          { name: 'Updated' },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeColumn', () => {
    beforeEach(() => {
      boardRepo.findOne.mockResolvedValue(mockBoard as Board);
      columnRepo.findOneBy.mockResolvedValue(mockColumn as BoardColumn);
    });

    it('should delete a column', async () => {
      await service.removeColumn(
        'project-123',
        'board-123',
        'column-123',
        'user-123',
      );

      expect(columnRepo.remove).toHaveBeenCalledWith(mockColumn);
    });

    it('should throw NotFoundException if column not found', async () => {
      columnRepo.findOneBy.mockResolvedValueOnce(null);

      await expect(
        service.removeColumn(
          'project-123',
          'board-123',
          'non-existent',
          'user-123',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  // REORDER COLUMNS TESTS
  // ===========================================
  describe('reorderColumns', () => {
    beforeEach(() => {
      boardRepo.findOne.mockResolvedValue(mockBoard as Board);
    });

    it('should reorder columns using bulk update', async () => {
      const orderedIds = ['col-3', 'col-1', 'col-2'];

      await service.reorderColumns(
        'project-123',
        'board-123',
        orderedIds,
        'user-123',
      );

      expect(columnRepo.query).toHaveBeenCalled();
    });

    it('should emit real-time event after reordering', async () => {
      const orderedIds = ['col-1', 'col-2'];

      await service.reorderColumns(
        'project-123',
        'board-123',
        orderedIds,
        'user-123',
      );

      expect(mockBoardsGateway.emitColumnsReordered).toHaveBeenCalledWith({
        projectId: 'project-123',
        boardId: 'board-123',
        orderedColumnIds: orderedIds,
      });
    });

    it('should do nothing if ordered list is empty', async () => {
      await service.reorderColumns('project-123', 'board-123', [], 'user-123');

      expect(columnRepo.query).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if non-lead tries to reorder', async () => {
      mockMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.DEVELOPER); // For reorder permission

      await expect(
        service.reorderColumns(
          'project-123',
          'board-123',
          ['col-1'],
          'user-123',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================
  // MOVE ISSUE TESTS
  // ===========================================
  describe('moveIssue', () => {
    const mockWorkflowStatus = {
      id: 'status-456',
      name: 'In Progress',
      projectId: 'project-123',
    };

    beforeEach(() => {
      boardRepo.findOne.mockResolvedValue(mockBoard as Board);

      const mockStatusRepo = {
        findOne: jest.fn().mockResolvedValue(mockWorkflowStatus),
      };
      const mockIssueRepoFromDataSource = {
        findOne: jest.fn().mockResolvedValue(mockIssue),
        save: jest.fn().mockImplementation((i) => Promise.resolve(i)),
      };

      mockDataSource.getRepository
        .mockReturnValueOnce(mockStatusRepo) // WorkflowStatus repo
        .mockReturnValueOnce(mockIssueRepoFromDataSource); // Issue repo
    });

    it('should move issue to new status and emit real-time event', async () => {
      await service.moveIssue(
        'project-123',
        'board-123',
        'issue-123',
        'status-456',
        5,
        'user-123',
      );

      expect(mockBoardsGateway.emitIssueMoved).toHaveBeenCalledWith(
        expect.objectContaining({
          issueId: 'issue-123',
          toStatusId: 'status-456',
          newOrder: 5,
        }),
      );
    });

    it('should throw NotFoundException if workflow status not found', async () => {
      // Reset mock queue from beforeEach and set test-specific value
      mockDataSource.getRepository.mockReset();
      const mockStatusRepo = { findOne: jest.fn().mockResolvedValue(null) };
      mockDataSource.getRepository.mockReturnValue(mockStatusRepo);

      await expect(
        service.moveIssue(
          'project-123',
          'board-123',
          'issue-123',
          'invalid-status',
          0,
          'user-123',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if issue not found', async () => {
      // Reset mock queue from beforeEach and set test-specific values
      mockDataSource.getRepository.mockReset();
      const mockStatusRepo = {
        findOne: jest.fn().mockResolvedValue(mockWorkflowStatus),
      };
      const mockIssueRepoFromDataSource = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      mockDataSource.getRepository
        .mockReturnValueOnce(mockStatusRepo)
        .mockReturnValueOnce(mockIssueRepoFromDataSource);

      await expect(
        service.moveIssue(
          'project-123',
          'board-123',
          'non-existent',
          'status-456',
          0,
          'user-123',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  // REORDER ISSUES TESTS
  // ===========================================
  describe('reorderIssues', () => {
    beforeEach(() => {
      boardRepo.findOne.mockResolvedValue(mockBoard as Board);
    });

    it('should reorder issues using bulk update', async () => {
      const orderedIds = ['issue-3', 'issue-1', 'issue-2'];

      await service.reorderIssues(
        'project-123',
        'board-123',
        'To Do',
        orderedIds,
        'user-123',
      );

      expect(mockDataSource.query).toHaveBeenCalled();
    });

    it('should emit real-time event after reordering', async () => {
      const orderedIds = ['issue-1', 'issue-2'];

      await service.reorderIssues(
        'project-123',
        'board-123',
        'To Do',
        orderedIds,
        'user-123',
      );

      expect(mockBoardsGateway.emitIssueReordered).toHaveBeenCalledWith({
        projectId: 'project-123',
        boardId: 'board-123',
        columnId: 'To Do',
        issues: orderedIds,
      });
    });

    it('should do nothing if ordered list is empty', async () => {
      await service.reorderIssues(
        'project-123',
        'board-123',
        'To Do',
        [],
        'user-123',
      );

      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });
});

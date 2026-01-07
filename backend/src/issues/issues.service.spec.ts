import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';

import { IssuesService } from './issues.service';
import {
  Issue,
  IssueStatus,
  IssuePriority,
  IssueType,
} from './entities/issue.entity';
import { IssueLink, LinkType } from './entities/issue-link.entity';
import { WorkLog } from './entities/work-log.entity';
import { Project } from '../projects/entities/project.entity';
import { Board } from '../boards/entities/board.entity';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { UsersService } from '../users/users.service';
import { CacheService } from '../cache/cache.service';
import { WorkflowTransitionsService } from '../workflows/services/workflow-transitions.service';
import { WorkflowStatusesService } from '../workflows/services/workflow-statuses.service';
import { TenantRepositoryFactory } from '../core/tenant';
import { BoardGateway } from '../gateways/board.gateway';
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
  // Specific internal methods if accessed
  manager?: { transaction: jest.Mock };
};

describe('IssuesService', () => {
  let service: IssuesService;
  let issueRepo: MockRepository<Issue>;
  let issueLinkRepo: MockRepository<IssueLink>;
  let projectRepo: MockRepository<Project>;

  // Explicitly typed service mocks
  let mockProjectMembersService: {
    getUserRole: jest.Mock;
    addMemberToProject: jest.Mock;
  };
  let mockUsersService: {
    findOneById: jest.Mock;
    findOneByEmail: jest.Mock;
  };
  let mockCacheService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    invalidateByTags: jest.Mock;
  };
  let mockTransitionsService: {
    isTransitionAllowed: jest.Mock;
  };
  let mockWorkflowStatusesService: {
    findById: jest.Mock;
    getDefaultStatus: jest.Mock;
    findByProjectAndName: jest.Mock;
  };
  let mockEventEmitter: {
    emit: jest.Mock;
  };
  let mockTenantRepoFactory: {
    create: jest.Mock;
  };

  // Test fixtures
  const mockProject: Partial<Project> = {
    id: 'project-123',
    key: 'ZEN',
    name: 'Zenith Project',
    organizationId: 'org-123',
  };

  const mockUser = {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    isSuperAdmin: false,
  };

  const mockIssue: Partial<Issue> = {
    id: 'issue-123',
    projectId: 'project-123',
    number: 42,
    title: 'Test Issue',
    description: 'Test description',
    status: 'Backlog',
    statusId: 'status-123',
    priority: IssuePriority.MEDIUM,
    type: IssueType.TASK,
    assigneeId: 'user-123',
    reporterId: 'user-123',
    storyPoints: 5,
    version: 1,
    isArchived: false,
    project: mockProject as Project,
  };

  const mockWorkflowStatus = {
    id: 'status-123',
    name: 'Backlog',
    projectId: 'project-123',
  };

  beforeEach(async () => {
    // Create mock repositories
    const createMockRepository = <T>(): MockRepository<T> => ({
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn().mockResolvedValue([]), // Return empty array by default
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      remove: jest.fn(),
      query: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getOne: jest.fn().mockResolvedValue(null),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn(),
      })),
      manager: {
        transaction: jest.fn((cb) =>
          cb({
            save: jest
              .fn()
              .mockImplementation((entity) => Promise.resolve(entity)),
          }),
        ),
      },
    });

    mockProjectMembersService = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
      addMemberToProject: jest.fn(),
    };

    mockUsersService = {
      findOneById: jest.fn().mockResolvedValue(mockUser),
      findOneByEmail: jest.fn(),
    };

    mockCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true),
      invalidateByTags: jest.fn().mockResolvedValue(true),
    };

    mockTransitionsService = {
      isTransitionAllowed: jest
        .fn()
        .mockResolvedValue({ allowed: true, transitionName: 'Move' }),
    };

    mockWorkflowStatusesService = {
      findById: jest.fn().mockResolvedValue(mockWorkflowStatus),
      getDefaultStatus: jest.fn().mockResolvedValue(mockWorkflowStatus),
      findByProjectAndName: jest.fn().mockResolvedValue(mockWorkflowStatus),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    // Assign to shared variable so tests can access it
    mockTenantRepoFactory = {
      create: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockProject),
        find: jest.fn().mockResolvedValue([mockProject]),
      }),
    };

    const mockBoardGateway = {
      server: {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuesService,
        {
          provide: getRepositoryToken(Issue),
          useValue: createMockRepository<Issue>(),
        },
        {
          provide: getRepositoryToken(IssueLink),
          useValue: createMockRepository<IssueLink>(),
        },
        {
          provide: getRepositoryToken(Project),
          useValue: createMockRepository<Project>(),
        },
        {
          provide: getRepositoryToken(WorkLog),
          useValue: createMockRepository<WorkLog>(),
        },
        {
          provide: getRepositoryToken(Board),
          useValue: createMockRepository<Board>(),
        },
        { provide: ProjectMembersService, useValue: mockProjectMembersService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: CacheService, useValue: mockCacheService },
        {
          provide: WorkflowTransitionsService,
          useValue: mockTransitionsService,
        },
        {
          provide: WorkflowStatusesService,
          useValue: mockWorkflowStatusesService,
        },
        { provide: TenantRepositoryFactory, useValue: mockTenantRepoFactory },
        { provide: BoardGateway, useValue: mockBoardGateway },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<IssuesService>(IssuesService);
    issueRepo = module.get(getRepositoryToken(Issue));
    issueLinkRepo = module.get(getRepositoryToken(IssueLink));
    projectRepo = module.get(getRepositoryToken(Project));

    // Trigger onModuleInit to set up tenant repos
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  // CREATE TESTS
  // ===========================================
  describe('create', () => {
    const createDto = {
      title: 'New Issue',
      description: 'Issue description',
      priority: IssuePriority.HIGH,
      type: IssueType.BUG,
    };

    beforeEach(() => {
      // Use copies to avoid pollution
      issueRepo.findOne.mockImplementation(() => Promise.resolve(null)); // No existing issue with same number
      issueRepo.create.mockImplementation(
        (dto) => ({ ...dto, id: 'new-issue-id' }) as Issue,
      );
      issueRepo.save.mockImplementation((issue) =>
        Promise.resolve({ ...issue, number: 1 } as Issue),
      );
    });

    it('should create an issue with auto-generated number', async () => {
      const result = await service.create('project-123', 'user-123', createDto);

      expect(result).toBeDefined();
      expect(issueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-123',
          title: 'New Issue',
          reporterId: 'user-123',
        }),
      );
      expect(issueRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if project not found', async () => {
      // Override internal repo
      (service as any).tenantProjectRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create('non-existent-project', 'user-123', createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if assignee is not a project member', async () => {
      // Restore factory (not strictly needed if using internal repo but good practice)
      (service as any).tenantProjectRepo.findOne.mockResolvedValue(mockProject);

      // Only ONE call is made for assignee check (reporter check is likely in Guard, not service body)
      mockProjectMembersService.getUserRole.mockResolvedValueOnce(null); // Assignee check fails

      const dtoWithAssignee = { ...createDto, assigneeId: 'non-member-user' };

      await expect(
        service.create('project-123', 'user-123', dtoWithAssignee),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if parent issue not found in project', async () => {
      // Add extra permissions for reporter check if needed
      mockProjectMembersService.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);

      issueRepo.findOne.mockResolvedValueOnce(null); // Last issue for number
      issueRepo.findOne.mockResolvedValueOnce(null); // Parent not found

      const dtoWithParent = { ...createDto, parentId: 'non-existent-parent' };

      await expect(
        service.create('project-123', 'user-123', dtoWithParent),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate status belongs to project', async () => {
      mockProjectMembersService.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);

      mockWorkflowStatusesService.findById.mockResolvedValueOnce({
        id: 'status-other',
        name: 'Other Status',
        projectId: 'different-project', // Wrong project
      });

      const dtoWithStatus = { ...createDto, statusId: 'status-other' };

      await expect(
        service.create('project-123', 'user-123', dtoWithStatus),
      ).rejects.toThrow(BadRequestException);
    });

    it('should emit issue.created event', async () => {
      await service.create('project-123', 'user-123', createDto);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'issue.created',
        expect.objectContaining({
          projectId: 'project-123',
          actorId: 'user-123',
        }),
      );
    });

    it('should invalidate project issues cache', async () => {
      await service.create('project-123', 'user-123', createDto);

      expect(mockCacheService.invalidateByTags).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('project:project-123'),
        ]),
      );
    });
  });

  // ===========================================
  // FIND ALL TESTS
  // ===========================================
  describe('findAll', () => {
    beforeEach(() => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockIssue]),
      };
      issueRepo.createQueryBuilder.mockReturnValue(mockQb as any);
    });

    it('should return issues for a project', async () => {
      const result = await service.findAll('project-123', 'user-123');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by status when provided', async () => {
      const mockQb = issueRepo.createQueryBuilder();

      await service.findAll('project-123', 'user-123', {
        status: IssueStatus.IN_PROGRESS,
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith('issue.status = :status', {
        status: IssueStatus.IN_PROGRESS,
      });
    });

    it('should filter by assignee when provided', async () => {
      const mockQb = issueRepo.createQueryBuilder();

      await service.findAll('project-123', 'user-123', {
        assigneeId: 'user-456',
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'assignee.id = :assigneeId',
        { assigneeId: 'user-456' },
      );
    });

    it('should filter by search term (title and description)', async () => {
      const mockQb = issueRepo.createQueryBuilder();

      await service.findAll('project-123', 'user-123', { search: 'bug fix' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(issue.title ILIKE :search OR issue.description ILIKE :search)',
        expect.any(Object),
      );
    });

    it('should exclude archived issues by default', async () => {
      const mockQb = issueRepo.createQueryBuilder();

      await service.findAll('project-123', 'user-123');

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'issue.isArchived = :isArchived',
        { isArchived: false },
      );
    });

    it('should include archived issues when requested', async () => {
      const mockQb = issueRepo.createQueryBuilder();

      await service.findAll('project-123', 'user-123', {
        includeArchived: true,
      });

      // Should NOT have the archived filter
      const calls = (mockQb.andWhere as jest.Mock).mock.calls;
      const hasArchivedFilter = calls.some((call: any[]) =>
        call[0].includes('isArchived'),
      );
      expect(hasArchivedFilter).toBe(false);
    });

    it('should filter issues not in any sprint', async () => {
      const mockQb = issueRepo.createQueryBuilder();

      await service.findAll('project-123', 'user-123', { sprint: 'null' });

      expect(mockQb.leftJoin).toHaveBeenCalledWith(
        'sprint_issues',
        'si_null',
        'si_null.issueId = issue.id',
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith('si_null.id IS NULL');
    });

    it('should apply priority sorting correctly', async () => {
      const mockQb = issueRepo.createQueryBuilder();

      await service.findAll('project-123', 'user-123', { sort: 'priority' });

      expect(mockQb.addOrderBy).toHaveBeenCalled();
    });
  });

  // ===========================================
  // FIND ONE TESTS
  // ===========================================
  describe('findOne', () => {
    it('should return cached issue if available', async () => {
      mockCacheService.get.mockResolvedValueOnce(mockIssue as Issue);
      mockProjectMembersService.getUserRole.mockResolvedValueOnce(
        ProjectRole.DEVELOPER,
      );

      const result = await service.findOne(
        'project-123',
        'issue-123',
        'user-123',
      );

      expect(result).toEqual(mockIssue);
      expect(mockCacheService.get).toHaveBeenCalledWith('issue:issue-123 ');
    });

    it('should fetch from DB and cache if not in cache', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      issueRepo.findOne.mockResolvedValueOnce(mockIssue as Issue);

      const result = await service.findOne(
        'project-123',
        'issue-123',
        'user-123',
      );

      expect(result).toEqual(mockIssue);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('issue:issue-123'),
        mockIssue,
        expect.objectContaining({ ttl: 900 }),
      );
    });

    it('should throw NotFoundException if issue not found', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      issueRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.findOne('project-123', 'non-existent', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a project member', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      issueRepo.findOne.mockResolvedValueOnce(mockIssue as Issue);
      mockProjectMembersService.getUserRole.mockResolvedValueOnce(null);

      await expect(
        service.findOne('project-123', 'issue-123', 'non-member'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should validate organization access', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      const issueWithDifferentOrg = {
        ...mockIssue,
        project: { ...mockProject, organizationId: 'different-org' },
      };
      issueRepo.findOne.mockResolvedValueOnce(issueWithDifferentOrg as Issue);

      await expect(
        service.findOne('project-123', 'issue-123', 'user-123', 'org-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  // UPDATE TESTS
  // ===========================================
  describe('update', () => {
    beforeEach(() => {
      mockCacheService.get.mockResolvedValue(null);
      // Use copies to avoid pollution
      issueRepo.findOne.mockImplementation(() => Promise.resolve({ ...mockIssue } as Issue));
      issueRepo.save.mockImplementation((issue) =>
        Promise.resolve(issue as Issue),
      );
    });

    it('should update issue fields', async () => {
      const updateDto = {
        title: 'Updated Title',
        description: 'Updated description',
      };

      // Need permission for findOne AND update check = 2 calls
      mockProjectMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD)
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD);

      const result = await service.update(
        'project-123',
        'issue-123',
        'user-123',
        updateDto,
      );

      expect(issueRepo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException on version mismatch (optimistic locking)', async () => {
      mockProjectMembersService.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);
      const updateDto = {
        title: 'Updated Title',
        expectedVersion: 5, // Different from mockIssue.version (1)
      };

      await expect(
        service.update('project-123', 'issue-123', 'user-123', updateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow update when version matches', async () => {
      mockProjectMembersService.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);
      const updateDto = {
        title: 'Updated Title',
        expectedVersion: 1, // Matches mockIssue.version
      };

      await expect(
        service.update('project-123', 'issue-123', 'user-123', updateDto),
      ).resolves.toBeDefined();
    });

    it('should throw ForbiddenException if non-lead, non-assignee, non-reporter tries to update', async () => {
      // Mock role: DEVELOPER (not LEAD)
      // Call 1: findOne -> check read permission (DEVELOPER ok)
      // Call 2: update -> check update permission (DEVELOPER not ok if not assignee/reporter)
      mockProjectMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.DEVELOPER)
        .mockResolvedValueOnce(ProjectRole.DEVELOPER);

      const differentUserIssue = {
        ...mockIssue,
        assigneeId: 'other-user',
        reporterId: 'other-user',
      };
      issueRepo.findOne.mockResolvedValueOnce(differentUserIssue as Issue);

      await expect(
        service.update('project-123', 'issue-123', 'user-123', {
          title: 'Updated',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow assignee to update their own issue', async () => {
      mockProjectMembersService.getUserRole.mockResolvedValue(
        ProjectRole.DEVELOPER,
      );

      const assigneeIssue = {
        ...mockIssue,
        assigneeId: 'user-123',
        reporterId: 'other-user',
      };
      issueRepo.findOne.mockResolvedValue({ ...assigneeIssue } as Issue);

      await expect(
        service.update('project-123', 'issue-123', 'user-123', {
          title: 'Updated',
        }),
      ).resolves.toBeDefined();
    });

    it('should throw BadRequestException if new assignee is not a project member', async () => {
      // Service calls getUserRole 3 times: findOne, update permission, assignee validation
      mockProjectMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For update permission
        .mockResolvedValueOnce(null); // Assignee not a member

      const updateDto = { assigneeId: 'non-member' };

      await expect(
        service.update('project-123', 'issue-123', 'user-123', updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if issue is set as its own parent', async () => {
      const updateDto = { parentId: 'issue-123' }; // Same as issue ID

      await expect(
        service.update('project-123', 'issue-123', 'user-123', updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should invalidate cache after update', async () => {
      await service.update('project-123', 'issue-123', 'user-123', {
        title: 'Updated',
      });

      expect(mockCacheService.del).toHaveBeenCalledWith(
        expect.stringContaining('issue:issue-123'),
      );
    });

    it('should emit issue.updated event on status change', async () => {
      const newStatus = {
        id: 'status-456',
        name: 'In Progress',
        projectId: 'project-123',
      };
      mockWorkflowStatusesService.findById.mockResolvedValueOnce(newStatus);

      await service.update('project-123', 'issue-123', 'user-123', {
        statusId: 'status-456',
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'issue.updated',
        expect.objectContaining({
          action: expect.stringContaining('changed status'),
        }),
      );
    });
  });

  // ===========================================
  // ARCHIVE TESTS
  // ===========================================
  describe('archive', () => {
    beforeEach(() => {
      mockCacheService.get.mockResolvedValue(null);
      // Return copy
      issueRepo.findOne.mockImplementation(() => Promise.resolve({ ...mockIssue } as Issue));
      issueRepo.save.mockImplementation((issue) =>
        Promise.resolve(issue as Issue),
      );
    });

    it('should archive an issue', async () => {
      // Need 2 calls: findOne (read access), archive (write access)
      mockProjectMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD)
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD);

      const result = await service.archive(
        'project-123',
        'issue-123',
        'user-123',
      );

      expect(result.isArchived).toBe(true);
      expect(result.archivedBy).toBe('user-123');
      expect(result.archivedAt).toBeDefined();
    });

    it('should throw ForbiddenException if non-lead/non-admin tries to archive', async () => {
      // Service calls getUserRole TWICE: once in findOne(), once in archive()
      mockProjectMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.DEVELOPER) // For findOne
        .mockResolvedValueOnce(ProjectRole.DEVELOPER); // For archive permission check
      mockUsersService.findOneById.mockResolvedValueOnce({
        ...mockUser,
        isSuperAdmin: false,
      });

      await expect(
        service.archive('project-123', 'issue-123', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if issue is already archived', async () => {
      const archivedIssue = { ...mockIssue, isArchived: true };
      issueRepo.findOne.mockResolvedValueOnce(archivedIssue as Issue);
      // Need read permission to find it first
      mockProjectMembersService.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);

      await expect(
        service.archive('project-123', 'issue-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should emit issue.archived event', async () => {
      // Reset mocks from previous tests
      issueRepo.findOne.mockReset();
      // Return fresh unarchived copy
      issueRepo.findOne.mockResolvedValue({ ...mockIssue } as Issue);

      mockProjectMembersService.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);

      await service.archive('project-123', 'issue-123', 'user-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'issue.archived',
        expect.objectContaining({
          projectId: 'project-123',
          issueId: 'issue-123',
        }),
      );
    });
  });

  // ===========================================
  // UNARCHIVE TESTS
  // ===========================================
  describe('unarchive', () => {
    const archivedIssue = {
      ...mockIssue,
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: 'user-123',
    };

    beforeEach(() => {
      // Return copy
      issueRepo.findOne.mockImplementation(() => Promise.resolve({ ...archivedIssue } as Issue));
      issueRepo.save.mockImplementation((issue) =>
        Promise.resolve(issue as Issue),
      );
    });

    it('should unarchive an issue', async () => {
      mockProjectMembersService.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);
      const result = await service.unarchive(
        'project-123',
        'issue-123',
        'user-123',
      );

      expect(result.isArchived).toBe(false);
      expect(result.archivedAt).toBeNull();
      expect(result.archivedBy).toBeNull();
    });

    it('should throw BadRequestException if issue is not archived', async () => {
      // Reset and set non-archived issue
      issueRepo.findOne.mockReset();
      issueRepo.findOne.mockResolvedValueOnce({ ...mockIssue } as Issue); // Not archived
      mockProjectMembersService.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);

      await expect(
        service.unarchive('project-123', 'issue-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================
  // REMOVE (DELETE) TESTS
  // ===========================================
  describe('remove', () => {
    beforeEach(() => {
      mockCacheService.get.mockResolvedValue(null);
      issueRepo.findOne.mockResolvedValue(mockIssue as Issue);
    });

    it('should delete an issue', async () => {
      await service.remove('project-123', 'issue-123', 'user-123');

      expect(issueRepo.remove).toHaveBeenCalledWith(mockIssue);
    });

    it('should throw ForbiddenException if non-lead/non-admin tries to delete', async () => {
      // Service calls getUserRole TWICE: once in findOne(), once in remove()
      mockProjectMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.DEVELOPER) // For findOne
        .mockResolvedValueOnce(ProjectRole.DEVELOPER); // For remove permission check
      mockUsersService.findOneById.mockResolvedValueOnce({
        ...mockUser,
        isSuperAdmin: false,
      });

      await expect(
        service.remove('project-123', 'issue-123', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should emit issue.deleted event', async () => {
      await service.remove('project-123', 'issue-123', 'user-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'issue.deleted',
        expect.objectContaining({
          projectId: 'project-123',
          issueId: 'issue-123',
        }),
      );
    });

    it('should invalidate cache after deletion', async () => {
      await service.remove('project-123', 'issue-123', 'user-123');

      expect(mockCacheService.del).toHaveBeenCalledWith(
        expect.stringContaining('issue:issue-123'),
      );
    });
  });

  // ===========================================
  // UPDATE STATUS TESTS
  // ===========================================
  describe('updateStatus', () => {
    beforeEach(() => {
      mockCacheService.get.mockResolvedValue(null);
      issueRepo.findOne.mockResolvedValue(mockIssue as Issue);
      issueRepo.save.mockImplementation((issue) =>
        Promise.resolve(issue as Issue),
      );
    });

    it('should update status when transition is allowed', async () => {
      mockTransitionsService.isTransitionAllowed.mockResolvedValueOnce({
        allowed: true,
        transitionName: 'Start Progress',
      });

      const result = await service.updateStatus(
        'project-123',
        'issue-123',
        'In Progress',
        'user-123',
      );

      expect(result.status).toBe('In Progress');
    });

    it('should throw ForbiddenException when transition is not allowed', async () => {
      mockTransitionsService.isTransitionAllowed.mockResolvedValueOnce({
        allowed: false,
        reason: 'Cannot skip stages',
      });

      await expect(
        service.updateStatus('project-123', 'issue-123', 'Done', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should emit issue.updated event with transition name', async () => {
      mockTransitionsService.isTransitionAllowed.mockResolvedValueOnce({
        allowed: true,
        transitionName: 'Complete',
      });

      await service.updateStatus(
        'project-123',
        'issue-123',
        'Done',
        'user-123',
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'issue.updated',
        expect.objectContaining({
          transitionName: 'Complete',
        }),
      );
    });
  });

  // ===========================================
  // MOVE ISSUE TESTS
  // ===========================================
  describe('moveIssue', () => {
    beforeEach(() => {
      mockCacheService.get.mockResolvedValue(null);
      issueRepo.findOne.mockResolvedValue(mockIssue as Issue);
    });

    it('should move issue to new status', async () => {
      const newStatus = {
        id: 'status-456',
        name: 'In Progress',
        projectId: 'project-123',
      };
      mockWorkflowStatusesService.findById.mockResolvedValueOnce(newStatus);

      const result = await service.moveIssue(
        'project-123',
        'issue-123',
        'user-123',
        {
          targetStatusId: 'status-456',
        },
      );

      expect(result).toBeDefined();
    });

    it('should throw ConflictException on version mismatch', async () => {
      await expect(
        service.moveIssue('project-123', 'issue-123', 'user-123', {
          expectedVersion: 999,
          targetStatusId: 'status-456',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if status belongs to different project', async () => {
      mockWorkflowStatusesService.findById.mockResolvedValueOnce({
        id: 'status-456',
        name: 'Done',
        projectId: 'different-project',
      });

      await expect(
        service.moveIssue('project-123', 'issue-123', 'user-123', {
          targetStatusId: 'status-456',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update position when provided', async () => {
      mockWorkflowStatusesService.findById.mockResolvedValueOnce(
        mockWorkflowStatus,
      );

      const result = await service.moveIssue(
        'project-123',
        'issue-123',
        'user-123',
        {
          targetStatusId: 'status-123',
          targetPosition: 5,
        },
      );

      expect(result.backlogOrder).toBe(5);
    });
  });

  // ===========================================
  // ISSUE LINKS TESTS
  // ===========================================
  describe('addLink', () => {
    const targetIssue = { ...mockIssue, id: 'issue-456' };

    beforeEach(() => {
      mockCacheService.get.mockResolvedValue(null);
      issueRepo.findOne
        .mockResolvedValueOnce(mockIssue as Issue) // Source issue
        .mockResolvedValueOnce(targetIssue as Issue); // Target issue
      issueLinkRepo.findOne.mockResolvedValue(null); // No existing link
      issueLinkRepo.create.mockImplementation((dto) => dto as IssueLink);
      issueLinkRepo.save.mockImplementation((link) =>
        Promise.resolve(link as IssueLink),
      );
    });

    it('should create a link between issues', async () => {
      const result = await service.addLink(
        'project-123',
        'issue-123',
        'issue-456',
        LinkType.BLOCKS,
        'user-123',
      );

      expect(result).toBeDefined();
      expect(issueLinkRepo.create).toHaveBeenCalledWith({
        sourceIssueId: 'issue-123',
        targetIssueId: 'issue-456',
        type: LinkType.BLOCKS,
      });
    });

    it('should throw BadRequestException when linking issue to itself', async () => {
      await expect(
        service.addLink(
          'project-123',
          'issue-123',
          'issue-123',
          LinkType.RELATES_TO,
          'user-123',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if link already exists', async () => {
      issueLinkRepo.findOne.mockResolvedValueOnce({
        id: 'existing-link',
      } as IssueLink);

      await expect(
        service.addLink(
          'project-123',
          'issue-123',
          'issue-456',
          LinkType.BLOCKS,
          'user-123',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if target issue not found', async () => {
      // Clear previous mock queue and set fresh values
      issueRepo.findOne.mockReset();
      issueRepo.findOne
        .mockResolvedValueOnce(mockIssue as Issue) // Source found
        .mockResolvedValueOnce(null); // Target not found

      await expect(
        service.addLink(
          'project-123',
          'issue-123',
          'non-existent',
          LinkType.RELATES_TO,
          'user-123',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeLink', () => {
    const mockLink = {
      id: 'link-123',
      sourceIssueId: 'issue-123',
      targetIssueId: 'issue-456',
      type: LinkType.BLOCKS,
      sourceIssue: mockIssue,
    };

    beforeEach(() => {
      issueLinkRepo.findOne.mockResolvedValue(mockLink as IssueLink);
      mockCacheService.get.mockResolvedValue(null);
      issueRepo.findOne.mockResolvedValue(mockIssue as Issue);
    });

    it('should remove a link', async () => {
      await service.removeLink('project-123', 'link-123', 'user-123');

      expect(issueLinkRepo.remove).toHaveBeenCalledWith(mockLink);
    });

    it('should throw NotFoundException if link not found', async () => {
      issueLinkRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.removeLink('project-123', 'non-existent', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLinks', () => {
    const mockLinks = [
      {
        id: 'link-1',
        sourceIssueId: 'issue-123',
        targetIssueId: 'issue-456',
        type: LinkType.BLOCKS,
      },
      {
        id: 'link-2',
        sourceIssueId: 'issue-789',
        targetIssueId: 'issue-123',
        type: LinkType.RELATES_TO,
      },
    ];

    beforeEach(() => {
      mockCacheService.get.mockResolvedValue(null);
      issueRepo.findOne.mockResolvedValue(mockIssue as Issue);
      issueLinkRepo.find.mockResolvedValue(mockLinks as IssueLink[]);
    });

    it('should return both outgoing and incoming links', async () => {
      const result = await service.getLinks(
        'project-123',
        'issue-123',
        'user-123',
      );

      expect(result).toHaveLength(2);
      expect(issueLinkRepo.find).toHaveBeenCalledWith({
        where: [{ sourceIssueId: 'issue-123' }, { targetIssueId: 'issue-123' }],
        relations: ['sourceIssue', 'targetIssue'],
      });
    });
  });

  // ===========================================
  // UPDATE LABELS TESTS
  // ===========================================
  describe('updateLabels', () => {
    beforeEach(() => {
      mockCacheService.get.mockResolvedValue(null);
      issueRepo.findOne.mockResolvedValue(mockIssue as Issue);

      const mockManager = {
        save: jest.fn().mockImplementation((issue) => Promise.resolve(issue)),
      };
      issueLinkRepo.manager!.transaction = jest.fn((cb) => cb(mockManager));
    });

    it('should update labels with unique, trimmed values', async () => {
      const labels = ['  bug  ', 'feature', 'bug', 'documentation'];

      const result = await service.updateLabels(
        'project-123',
        'issue-123',
        labels,
        'user-123',
      );

      expect(result.labels).toEqual(['bug', 'feature', 'documentation']);
    });

    it('should filter out empty labels', async () => {
      const labels = ['bug', '', '  ', 'feature'];

      const result = await service.updateLabels(
        'project-123',
        'issue-123',
        labels,
        'user-123',
      );

      expect(result.labels).toEqual(['bug', 'feature']);
    });

    it('should emit issue.updated event', async () => {
      await service.updateLabels(
        'project-123',
        'issue-123',
        ['bug'],
        'user-123',
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'issue.updated',
        expect.objectContaining({ action: 'updated labels' }),
      );
    });
  });
});

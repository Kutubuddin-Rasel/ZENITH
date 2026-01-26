import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { SprintsService } from './sprints.service';
import { Sprint, SprintStatus } from './entities/sprint.entity';
import { SprintIssue } from './entities/sprint-issue.entity';
import { SprintSnapshot } from './entities/sprint-snapshot.entity';
import { Project } from '../projects/entities/project.entity';
import { Issue, IssueStatus } from '../issues/entities/issue.entity';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { IssuesService } from '../issues/issues.service';
import { BoardsService } from '../boards/boards.service';
import { SmartDefaultsService } from '../user-preferences/services/smart-defaults.service';
import { TenantRepositoryFactory } from '../core/tenant';
import { ProjectRole } from '../membership/enums/project-role.enum';

// Helper types for strict mocking
type MockRepository<T = any> = {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  findOneBy: jest.Mock;
  remove: jest.Mock;
  update: jest.Mock;
  query: jest.Mock;
  createQueryBuilder: jest.Mock;
  manager?: { transaction: jest.Mock };
};

describe('SprintsService', () => {
  let service: SprintsService;
  let sprintRepo: MockRepository<Sprint>;
  let sprintIssueRepo: MockRepository<SprintIssue>;
  let snapshotRepo: MockRepository<SprintSnapshot>;

  // Explicitly typed service mocks
  let mockMembersService: {
    getUserRole: jest.Mock;
  };
  let mockIssuesService: {
    findOne: jest.Mock;
  };
  let mockBoardsService: {
    findAll: jest.Mock;
    create: jest.Mock;
  };
  let mockSmartDefaultsService: {
    learnFromBehavior: jest.Mock;
  };
  let mockEventEmitter: {
    emit: jest.Mock;
  };

  // Test fixtures
  const mockProject: Partial<Project> = {
    id: 'project-123',
    key: 'ZEN',
    name: 'Zenith Project',
    organizationId: 'org-123',
  };

  const mockSprint: Partial<Sprint> = {
    id: 'sprint-123',
    projectId: 'project-123',
    name: 'Sprint 1',
    goal: 'Complete feature X',
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    status: SprintStatus.PLANNED,
    isActive: false,
    project: mockProject as Project,
    issues: [],
  };

  const mockActiveSprint: Partial<Sprint> = {
    ...mockSprint,
    id: 'sprint-active',
    status: SprintStatus.ACTIVE,
    isActive: true,
  };

  const mockIssue: Partial<Issue> = {
    id: 'issue-123',
    projectId: 'project-123',
    title: 'Test Issue',
    status: 'Backlog',
    storyPoints: 5,
  };

  const mockSprintIssue: Partial<SprintIssue> = {
    id: 'si-123',
    sprintId: 'sprint-123',
    issueId: 'issue-123',
    sprintOrder: 0,
    issue: mockIssue as Issue,
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
      update: jest.fn(),
      query: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        subQuery: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalIssues: 10,
          totalPoints: 50,
          completedPoints: 20,
          completedIssues: 4,
        }),
        getMany: jest.fn().mockResolvedValue([]),
        getQuery: jest.fn().mockReturnValue('subquery'),
      })),
      manager: {
        transaction: jest.fn((cb) =>
          cb({
            create: jest.fn().mockImplementation((Entity, dto) => dto),
            save: jest
              .fn()
              .mockImplementation((entity) =>
                Promise.resolve({ id: 'new-id', ...entity }),
              ),
            remove: jest.fn().mockResolvedValue(undefined),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            findOne: jest.fn(),
          }),
        ),
      },
    });

    mockMembersService = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    };

    mockIssuesService = {
      findOne: jest.fn().mockResolvedValue(mockIssue),
    };

    mockBoardsService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'board-123' }),
    };

    mockSmartDefaultsService = {
      learnFromBehavior: jest.fn().mockResolvedValue(undefined),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockTenantRepoFactory = {
      create: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockProject),
        find: jest.fn().mockResolvedValue([mockProject]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintsService,
        {
          provide: getRepositoryToken(Sprint),
          useValue: createMockRepository<Sprint>(),
        },
        {
          provide: getRepositoryToken(SprintIssue),
          useValue: createMockRepository<SprintIssue>(),
        },
        {
          provide: getRepositoryToken(SprintSnapshot),
          useValue: createMockRepository<SprintSnapshot>(),
        },
        {
          provide: getRepositoryToken(Project),
          useValue: createMockRepository<Project>(),
        },
        { provide: ProjectMembersService, useValue: mockMembersService },
        { provide: IssuesService, useValue: mockIssuesService },
        { provide: BoardsService, useValue: mockBoardsService },
        { provide: SmartDefaultsService, useValue: mockSmartDefaultsService },
        { provide: TenantRepositoryFactory, useValue: mockTenantRepoFactory },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<SprintsService>(SprintsService);
    sprintRepo = module.get(getRepositoryToken(Sprint));
    sprintIssueRepo = module.get(getRepositoryToken(SprintIssue));
    snapshotRepo = module.get(getRepositoryToken(SprintSnapshot));

    // Mock projectRepo.findOne for getVelocity tests
    const projectRepo = module.get(getRepositoryToken(Project));
    projectRepo.findOne.mockResolvedValue(mockProject);

    // Trigger onModuleInit
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
      name: 'Sprint 2',
      goal: 'Complete feature Y',
      startDate: '2025-01-15',
      endDate: '2025-01-28',
    };

    beforeEach(() => {
      sprintRepo.create.mockImplementation(
        (dto) => ({ ...dto, id: 'new-sprint' }) as Sprint,
      );
      sprintRepo.save.mockImplementation((sprint) =>
        Promise.resolve(sprint as Sprint),
      );
    });

    it('should create a sprint', async () => {
      const result = await service.create('project-123', 'user-123', createDto);

      expect(result).toBeDefined();
      expect(sprintRepo.create).toHaveBeenCalledWith({
        projectId: 'project-123',
        ...createDto,
      });
      expect(sprintRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if project not found', async () => {
      // Override the internal repository instance directly
      (service as any).tenantProjectRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create('non-existent', 'user-123', createDto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set isActive=true when status is ACTIVE', async () => {
      // Restore repo behavior - though beforeEach usually resets, we must be careful with internal overrides
      (service as any).tenantProjectRepo.findOne.mockResolvedValue(mockProject);

      const activeSprintDto = { ...createDto, status: SprintStatus.ACTIVE };
      sprintRepo.create.mockReturnValueOnce({
        ...activeSprintDto,
        id: 'sprint-id',
        projectId: 'project-123',
        isActive: true,
        issues: [],
      } as unknown as Sprint);
      sprintRepo.save.mockImplementation((s) =>
        Promise.resolve({ ...s, isActive: true } as Sprint),
      );

      const result = await service.create(
        'project-123',
        'user-123',
        activeSprintDto as any,
      );

      expect(result.isActive).toBe(true);
    });

    it('should create a board when sprint is created as ACTIVE', async () => {
      sprintRepo.create.mockReturnValueOnce({
        ...createDto,
        id: 'sprint-id',
        projectId: 'project-123',
        status: SprintStatus.ACTIVE,
        isActive: true,
        issues: [],
      } as unknown as Sprint);
      sprintRepo.save.mockResolvedValueOnce({
        ...createDto,
        id: 'sprint-id',
        projectId: 'project-123',
        status: SprintStatus.ACTIVE,
        isActive: true,
        issues: [],
        name: 'Sprint 2',
      } as unknown as Sprint);
      mockBoardsService.findAll.mockResolvedValueOnce([]);

      await service.create('project-123', 'user-123', {
        ...createDto,
        status: SprintStatus.ACTIVE,
      } as any);

      expect(mockBoardsService.create).toHaveBeenCalled();
    });

    it('should emit sprint.event after creation', async () => {
      await service.create('project-123', 'user-123', createDto);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'sprint.event',
        expect.objectContaining({
          action: expect.stringContaining('created sprint'),
          sprintName: createDto.name,
        }),
      );
    });
  });

  // ... (skip finding findAll, findOne etc.)

  // ... (skip to captureSnapshot in the file, around line 790 in edited file)
  // Since I can't skip blindly, I will target the captureSnapshot block specifically
  // Wait, I can do multi_replace to target event test AND captureSnapshot test.

  // ===========================================
  // FIND ALL TESTS
  // ===========================================
  describe('findAll', () => {
    beforeEach(() => {
      sprintRepo.find.mockResolvedValue([mockSprint as Sprint]);
    });

    it('should return all sprints for a project', async () => {
      const result = await service.findAll('project-123', 'user-123');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(sprintRepo.find).toHaveBeenCalledWith({
        where: { projectId: 'project-123' },
      });
    });

    it('should filter by active sprints when requested', async () => {
      await service.findAll('project-123', 'user-123', true);

      expect(sprintRepo.find).toHaveBeenCalledWith({
        where: {
          projectId: 'project-123',
          isActive: true,
          status: SprintStatus.ACTIVE,
        },
      });
    });

    it('should throw NotFoundException if project not found', async () => {
      // Override internal repo
      (service as any).tenantProjectRepo.findOne.mockResolvedValue(null);

      await expect(service.findAll('non-existent', 'user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ... (in BoardsService)
  // This replacement chunk is for SprintsService, I'll do BoardsService in next tool call or separate chunks if possible.
  // Wait, I can't edit two files in one call unless I use multi_replace but multi_replace is for same file non-contiguous.
  // I'll stick to one file per tool call to be safe and clear.

  // So just SprintsService findAll here.

  // ===========================================
  // FIND ONE TESTS
  // ===========================================
  describe('findOne', () => {
    beforeEach(() => {
      sprintRepo.findOne.mockResolvedValue(mockSprint as Sprint);
    });

    it('should return a sprint', async () => {
      const result = await service.findOne(
        'project-123',
        'sprint-123',
        'user-123',
      );

      expect(result).toEqual(mockSprint);
    });

    it('should throw NotFoundException if sprint not found', async () => {
      sprintRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.findOne('project-123', 'non-existent', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a project member', async () => {
      mockMembersService.getUserRole.mockResolvedValueOnce(null);

      await expect(
        service.findOne('project-123', 'sprint-123', 'non-member'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================
  // UPDATE TESTS
  // ===========================================
  describe('update', () => {
    beforeEach(() => {
      sprintRepo.findOne.mockResolvedValue(mockSprint as Sprint);
      sprintRepo.save.mockImplementation((sprint) =>
        Promise.resolve(sprint as Sprint),
      );
    });

    it('should update sprint metadata', async () => {
      const updateDto = { name: 'Updated Sprint', goal: 'New goal' };

      const result = await service.update(
        'project-123',
        'sprint-123',
        'user-123',
        updateDto,
      );

      expect(result.name).toBe('Updated Sprint');
      expect(result.goal).toBe('New goal');
    });

    it('should throw ForbiddenException if non-lead tries to update', async () => {
      mockMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.DEVELOPER); // For update permission check

      await expect(
        service.update('project-123', 'sprint-123', 'user-123', {
          name: 'Updated',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should set isActive=true when updating to ACTIVE status', async () => {
      const updateDto = { status: SprintStatus.ACTIVE } as any;

      const result = await service.update(
        'project-123',
        'sprint-123',
        'user-123',
        updateDto,
      );

      expect(result.isActive).toBe(true);
    });

    it('should emit sprint.event after update', async () => {
      await service.update('project-123', 'sprint-123', 'user-123', {
        name: 'Updated',
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'sprint.event',
        expect.any(Object),
      );
    });
  });

  // ===========================================
  // ARCHIVE TESTS
  // ===========================================
  describe('archive', () => {
    const incompleteSprintIssue = {
      ...mockSprintIssue,
      issue: { ...mockIssue, status: 'In Progress' },
    };
    const completedSprintIssue = {
      ...mockSprintIssue,
      issue: { ...mockIssue, status: 'Done' },
    };

    beforeEach(() => {
      sprintRepo.findOne.mockResolvedValue(mockActiveSprint as Sprint);
      sprintRepo.save.mockImplementation((sprint) =>
        Promise.resolve(sprint as Sprint),
      );
      sprintIssueRepo.find.mockResolvedValue([
        incompleteSprintIssue as SprintIssue,
      ]);
    });

    it('should archive a sprint and set status to COMPLETED', async () => {
      sprintIssueRepo.find.mockResolvedValueOnce([
        completedSprintIssue as SprintIssue,
      ]);

      const result = await service.archive(
        'project-123',
        'sprint-active',
        'user-123',
      );

      expect(result.status).toBe(SprintStatus.COMPLETED);
      expect(result.isActive).toBe(false);
    });

    it('should throw ForbiddenException if non-lead tries to archive', async () => {
      mockMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.DEVELOPER); // For archive permission

      await expect(
        service.archive('project-123', 'sprint-active', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should move incomplete issues to next sprint if provided', async () => {
      const nextSprint = { ...mockSprint, id: 'sprint-next', isActive: true };
      sprintRepo.findOne
        .mockResolvedValueOnce(mockActiveSprint as Sprint) // Current sprint
        .mockResolvedValueOnce(nextSprint as Sprint); // Next sprint

      await service.archive(
        'project-123',
        'sprint-active',
        'user-123',
        'sprint-next',
      );

      expect(sprintIssueRepo.update).toHaveBeenCalledWith(
        { id: In([incompleteSprintIssue.id]) },
        { sprintId: 'sprint-next' },
      );
    });

    it('should remove incomplete issues from sprint (move to backlog) if no next sprint', async () => {
      await service.archive('project-123', 'sprint-active', 'user-123');

      expect(sprintIssueRepo.remove).toHaveBeenCalled();
    });

    it('should throw BadRequestException if next sprint not found or not active', async () => {
      sprintRepo.findOne
        .mockResolvedValueOnce(mockActiveSprint as Sprint)
        .mockResolvedValueOnce(null); // Next sprint not found

      await expect(
        service.archive(
          'project-123',
          'sprint-active',
          'user-123',
          'invalid-sprint',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should track sprint completion behavior via SmartDefaultsService', async () => {
      sprintIssueRepo.find.mockResolvedValueOnce([
        completedSprintIssue as SprintIssue,
        incompleteSprintIssue as SprintIssue,
      ]);

      await service.archive('project-123', 'sprint-active', 'user-123');

      expect(mockSmartDefaultsService.learnFromBehavior).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          action: 'sprint_completed',
          context: expect.objectContaining({
            projectId: 'project-123',
          }),
        }),
      );
    });
  });

  // ===========================================
  // REMOVE (DELETE) TESTS
  // ===========================================
  describe('remove', () => {
    beforeEach(() => {
      sprintRepo.findOne.mockResolvedValue(mockSprint as Sprint);
    });

    it('should delete a sprint', async () => {
      await service.remove('project-123', 'sprint-123', 'user-123');

      expect(sprintRepo.remove).toHaveBeenCalledWith(mockSprint);
    });

    it('should throw ForbiddenException if non-lead tries to delete', async () => {
      mockMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.DEVELOPER); // For delete permission

      await expect(
        service.remove('project-123', 'sprint-123', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should emit sprint.event after deletion', async () => {
      await service.remove('project-123', 'sprint-123', 'user-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'sprint.event',
        expect.any(Object),
      );
    });
  });

  // ===========================================
  // ADD ISSUE TESTS
  // ===========================================
  describe('addIssue', () => {
    beforeEach(() => {
      sprintRepo.findOne.mockResolvedValue(mockSprint as Sprint);
      mockIssuesService.findOne.mockResolvedValue(mockIssue as Issue);
    });

    it('should add an issue to the sprint', async () => {
      const result = await service.addIssue(
        'project-123',
        'sprint-123',
        'user-123',
        {
          issueId: 'issue-123',
        },
      );

      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException for viewers', async () => {
      mockMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.VIEWER); // For add permission

      await expect(
        service.addIssue('project-123', 'sprint-123', 'user-123', {
          issueId: 'issue-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update issue status from Backlog to TODO', async () => {
      const backlogIssue = { ...mockIssue, status: 'Backlog' };
      mockIssuesService.findOne.mockResolvedValueOnce(backlogIssue as Issue);

      await service.addIssue('project-123', 'sprint-123', 'user-123', {
        issueId: 'issue-123',
      });

      // Transaction manager should update issue status
      const mockManager = await sprintIssueRepo.manager!.transaction((m) => m);
      expect(mockManager.update).toBeDefined();
    });

    it('should emit sprint.event after adding issue', async () => {
      await service.addIssue('project-123', 'sprint-123', 'user-123', {
        issueId: 'issue-123',
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'sprint.event',
        expect.any(Object),
      );
    });
  });

  // ===========================================
  // REMOVE ISSUE TESTS
  // ===========================================
  describe('removeIssue', () => {
    beforeEach(() => {
      sprintRepo.findOne.mockResolvedValue(mockSprint as Sprint);
      sprintIssueRepo.findOneBy.mockResolvedValue(
        mockSprintIssue as SprintIssue,
      );
    });

    it('should remove an issue from the sprint', async () => {
      await service.removeIssue('project-123', 'sprint-123', 'user-123', {
        issueId: 'issue-123',
      });

      // Transaction should be called
      expect(sprintIssueRepo.manager!.transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if issue not in sprint', async () => {
      sprintIssueRepo.findOneBy.mockResolvedValueOnce(null);

      await expect(
        service.removeIssue('project-123', 'sprint-123', 'user-123', {
          issueId: 'non-existent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for viewers', async () => {
      mockMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.VIEWER); // For remove permission

      await expect(
        service.removeIssue('project-123', 'sprint-123', 'user-123', {
          issueId: 'issue-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================
  // START SPRINT TESTS
  // ===========================================
  describe('startSprint', () => {
    beforeEach(() => {
      sprintRepo.findOne.mockResolvedValue(mockSprint as Sprint);
      sprintRepo.save.mockImplementation((sprint) =>
        Promise.resolve({ ...sprint, isActive: true } as Sprint),
      );
      snapshotRepo.findOne.mockResolvedValue(null);
      snapshotRepo.create.mockImplementation((dto) => dto as SprintSnapshot);
      snapshotRepo.save.mockImplementation((s) =>
        Promise.resolve(s as SprintSnapshot),
      );
    });

    it('should start a sprint and set status to ACTIVE', async () => {
      const result = await service.startSprint(
        'project-123',
        'sprint-123',
        'user-123',
      );

      expect(result.status).toBe(SprintStatus.ACTIVE);
      expect(result.isActive).toBe(true);
    });

    it('should throw ForbiddenException if non-lead tries to start', async () => {
      mockMembersService.getUserRole
        .mockResolvedValueOnce(ProjectRole.PROJECT_LEAD) // For findOne
        .mockResolvedValueOnce(ProjectRole.DEVELOPER); // For start permission

      await expect(
        service.startSprint('project-123', 'sprint-123', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should capture initial snapshot when sprint starts', async () => {
      await service.startSprint('project-123', 'sprint-123', 'user-123');

      // captureSnapshot should be called
      expect(snapshotRepo.save).toHaveBeenCalled();
    });

    it('should create a board if none exists', async () => {
      mockBoardsService.findAll.mockResolvedValueOnce([]);

      await service.startSprint('project-123', 'sprint-123', 'user-123');

      expect(mockBoardsService.create).toHaveBeenCalled();
    });
  });

  // ===========================================
  // CAPTURE SNAPSHOT TESTS
  // ===========================================
  // ===========================================
  // CAPTURE SNAPSHOT TESTS
  // ===========================================
  describe('captureSnapshot', () => {
    beforeEach(() => {
      // Default: Active sprint
      sprintRepo.findOne.mockResolvedValue({
        ...mockActiveSprint,
        status: SprintStatus.ACTIVE,
        isActive: true,
      } as Sprint);

      snapshotRepo.findOne.mockResolvedValue(null);
      snapshotRepo.create.mockImplementation((dto) => dto as SprintSnapshot);
      snapshotRepo.save.mockImplementation((s) =>
        Promise.resolve(s as SprintSnapshot),
      );

      // Mock sprintIssueRepo.createQueryBuilder for stats aggregation
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalIssues: 10,
          totalPoints: 50,
          completedPoints: 20,
          completedIssues: 4,
        }),
      };
      sprintIssueRepo.createQueryBuilder.mockReturnValue(mockQb as any);
    });

    it('should capture a snapshot for an active sprint', async () => {
      await service.captureSnapshot('sprint-active');

      expect(snapshotRepo.save).toHaveBeenCalled();
    });

    it('should not capture snapshot for non-active sprint', async () => {
      // Force non-active
      sprintRepo.findOne.mockResolvedValueOnce({
        ...mockSprint,
        status: SprintStatus.PLANNED,
        isActive: false,
      } as Sprint);

      await service.captureSnapshot('sprint-123');

      expect(snapshotRepo.save).not.toHaveBeenCalled();
    });

    it('should update existing snapshot if one exists for today', async () => {
      const existingSnapshot = {
        id: 'snapshot-1',
        sprintId: 'sprint-active',
        date: new Date().toISOString().split('T')[0],
        totalPoints: 0,
        completedPoints: 0,
        remainingPoints: 0,
        totalIssues: 0,
        completedIssues: 0,
      };
      snapshotRepo.findOne.mockResolvedValueOnce(
        existingSnapshot as SprintSnapshot,
      );

      await service.captureSnapshot('sprint-active');

      expect(snapshotRepo.create).not.toHaveBeenCalled();
      expect(snapshotRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'snapshot-1' }),
      );
    });

    it('should calculate metrics correctly from aggregation', async () => {
      await service.captureSnapshot('sprint-active');

      expect(snapshotRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          totalPoints: 50,
          completedPoints: 20,
          remainingPoints: 30,
          totalIssues: 10,
          completedIssues: 4,
        }),
      );
    });
  });

  // ===========================================
  // GET BURNDOWN TESTS
  // ===========================================
  describe('getBurndown', () => {
    const mockSnapshots = [
      {
        date: '2025-01-01',
        totalPoints: 50,
        completedPoints: 0,
        remainingPoints: 50,
      },
      {
        date: '2025-01-02',
        totalPoints: 50,
        completedPoints: 10,
        remainingPoints: 40,
      },
      {
        date: '2025-01-03',
        totalPoints: 50,
        completedPoints: 25,
        remainingPoints: 25,
      },
    ];

    beforeEach(() => {
      sprintRepo.findOne.mockResolvedValue(mockSprint as Sprint);
      snapshotRepo.find.mockResolvedValue(mockSnapshots as SprintSnapshot[]);
    });

    it('should return burndown data with snapshots and ideal burn rate', async () => {
      const result = await service.getBurndown(
        'project-123',
        'sprint-123',
        'user-123',
      );

      expect(result.sprint).toBeDefined();
      expect(result.snapshots).toHaveLength(3);
      expect(result.idealBurnRate).toBeDefined();
      expect(result.initialScope).toBe(50);
    });

    it('should calculate ideal burn rate correctly', async () => {
      const result = await service.getBurndown(
        'project-123',
        'sprint-123',
        'user-123',
      );

      // 14 days sprint, 50 points
      const expectedBurnRate = 50 / 13; // (end - start) days
      expect(result.idealBurnRate).toBeCloseTo(expectedBurnRate, 1);
    });
  });

  // ===========================================
  // GET VELOCITY TESTS
  // ===========================================
  describe('getVelocity', () => {
    const completedSprints = [
      {
        id: 'sprint-1',
        name: 'Sprint 1',
        status: SprintStatus.COMPLETED,
        endDate: '2025-01-14',
        projectId: 'project-123',
        startDate: '2025-01-01',
        isActive: false,
        issues: [],
      },
      {
        id: 'sprint-2',
        name: 'Sprint 2',
        status: SprintStatus.COMPLETED,
        endDate: '2025-01-28',
        projectId: 'project-123',
        startDate: '2025-01-15',
        isActive: false,
        issues: [],
      },
    ];

    beforeEach(() => {
      const projectRepo = sprintRepo.manager!.transaction;
      sprintRepo.find.mockResolvedValue(
        completedSprints as unknown as Sprint[],
      );

      const mockQb = snapshotRepo.createQueryBuilder();
      (mockQb.getMany as jest.Mock).mockResolvedValue([
        { sprintId: 'sprint-1', completedPoints: 30, totalPoints: 40 },
        { sprintId: 'sprint-2', completedPoints: 35, totalPoints: 40 },
      ]);
    });

    it('should return velocity data for completed sprints', async () => {
      const result = await service.getVelocity('project-123', 'user-123');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array if no completed sprints', async () => {
      sprintRepo.find.mockResolvedValueOnce([]);

      const result = await service.getVelocity('project-123', 'user-123');

      expect(result).toEqual([]);
    });

    it('should limit to last 5 sprints', async () => {
      const manySprints = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `sprint-${i}`,
          name: `Sprint ${i}`,
          status: SprintStatus.COMPLETED,
        }));
      sprintRepo.find.mockResolvedValueOnce(manySprints as Sprint[]);

      await service.getVelocity('project-123', 'user-123');

      expect(sprintRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  // ===========================================
  // GET BURNUP TESTS
  // ===========================================
  describe('getBurnup', () => {
    const mockSnapshots = [
      {
        date: '2025-01-01',
        totalPoints: 40,
        completedPoints: 0,
        remainingPoints: 40,
      },
      {
        date: '2025-01-07',
        totalPoints: 50,
        completedPoints: 20,
        remainingPoints: 30,
      },
      {
        date: '2025-01-14',
        totalPoints: 55,
        completedPoints: 45,
        remainingPoints: 10,
      },
    ];

    beforeEach(() => {
      sprintRepo.findOne.mockResolvedValue(mockSprint as Sprint);
      snapshotRepo.find.mockResolvedValue(mockSnapshots as SprintSnapshot[]);
    });

    it('should return burnup data with scope creep calculation', async () => {
      const result = await service.getBurnup(
        'project-123',
        'sprint-123',
        'user-123',
      );

      expect(result.sprint).toBeDefined();
      expect(result.snapshots).toHaveLength(3);
      expect(result.initialScope).toBe(40);
      expect(result.currentScope).toBe(55);
      expect(result.scopeCreep).toBe(15);
      expect(result.scopeCreepPercentage).toBe(37.5); // 15/40 * 100
    });

    it('should handle zero initial scope gracefully', async () => {
      snapshotRepo.find.mockResolvedValueOnce([]);

      const result = await service.getBurnup(
        'project-123',
        'sprint-123',
        'user-123',
      );

      expect(result.initialScope).toBe(0);
      expect(result.scopeCreepPercentage).toBe(0);
    });
  });

  // ===========================================
  // GET SPRINT ISSUES TESTS
  // ===========================================
  describe('getSprintIssues', () => {
    beforeEach(() => {
      sprintIssueRepo.find.mockResolvedValue([mockSprintIssue as SprintIssue]);
    });

    it('should return issues in a sprint ordered by sprintOrder', async () => {
      const result = await service.getSprintIssues(
        'project-123',
        'sprint-123',
        'user-123',
      );

      expect(result).toBeDefined();
      expect(sprintIssueRepo.find).toHaveBeenCalledWith({
        where: { sprintId: 'sprint-123' },
        relations: ['issue'],
        order: { sprintOrder: 'ASC' },
      });
    });

    it('should throw ForbiddenException if user is not a project member', async () => {
      mockMembersService.getUserRole.mockResolvedValueOnce(null);

      await expect(
        service.getSprintIssues('project-123', 'sprint-123', 'non-member'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================
  // FIND ALL ACTIVE SYSTEM WIDE TESTS
  // ===========================================
  describe('findAllActiveSystemWide', () => {
    it('should return all active sprints across all projects', async () => {
      sprintRepo.find.mockResolvedValue([mockActiveSprint as Sprint]);

      const result = await service.findAllActiveSystemWide();

      expect(result).toHaveLength(1);
      expect(sprintRepo.find).toHaveBeenCalledWith({
        where: {
          status: SprintStatus.ACTIVE,
          isActive: true,
        },
      });
    });
  });
});

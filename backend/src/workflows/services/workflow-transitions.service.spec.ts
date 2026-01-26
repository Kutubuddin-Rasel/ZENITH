import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowTransitionsService } from './workflow-transitions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorkflowTransition } from '../entities/workflow-transition.entity';
import { WorkflowStatusesService } from './workflow-statuses.service';
import { NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';

describe('WorkflowTransitionsService', () => {
  let service: WorkflowTransitionsService;
  let repo: any;
  let statusesService: any;

  const mockTransition = {
    id: 'trans-123',
    name: 'To Done',
    projectId: 'p1',
    fromStatusId: 's1',
    toStatusId: 's2',
    isActive: true,
    allowedRoles: ['Developer'],
    toStatus: { id: 's2', name: 'Done' },
  };

  const mockIssue = {
    id: 'issue-1',
    projectId: 'p1',
    type: 'Story',
    status: 'In Progress',
    storyPoints: 5,
  } as any;

  beforeEach(async () => {
    const mockRepo = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    };

    const mockStatusesService = {
      findByProjectAndName: jest.fn(),
      findByProject: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowTransitionsService,
        {
          provide: getRepositoryToken(WorkflowTransition),
          useValue: mockRepo,
        },
        { provide: WorkflowStatusesService, useValue: mockStatusesService },
      ],
    }).compile();

    service = module.get<WorkflowTransitionsService>(
      WorkflowTransitionsService,
    );
    repo = module.get(getRepositoryToken(WorkflowTransition));
    statusesService = module.get(WorkflowStatusesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isTransitionAllowed', () => {
    it('should fail if target status is not found', async () => {
      statusesService.findByProjectAndName.mockResolvedValue(null);
      statusesService.findByProject.mockResolvedValue([{ id: 's1' }]); // workflow exists

      const result = await service.isTransitionAllowed(
        'p1',
        'Todo',
        'Unknown',
        'Dev',
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not defined');
    });

    it('should allow if no rules defined for project', async () => {
      statusesService.findByProjectAndName.mockResolvedValue({ id: 's2' });
      repo.find.mockResolvedValue([]); // no specific match
      repo.count.mockResolvedValue(0); // no rules at all

      const result = await service.isTransitionAllowed(
        'p1',
        'Todo',
        'Done',
        'Dev',
      );
      expect(result.allowed).toBe(true);
    });

    it('should deny if rules exist but none match', async () => {
      statusesService.findByProjectAndName.mockResolvedValue({ id: 's2' });
      repo.find.mockResolvedValue([]); // no specific match
      repo.count.mockResolvedValue(5); // other rules exist

      const result = await service.isTransitionAllowed(
        'p1',
        'Todo',
        'Done',
        'Dev',
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No transition defined');
    });

    it('should allow if rule matches and role is allowed', async () => {
      statusesService.findByProjectAndName.mockResolvedValue({ id: 's2' });
      repo.find.mockResolvedValue([mockTransition]);
      repo.count.mockResolvedValue(5);

      const result = await service.isTransitionAllowed(
        'p1',
        'Todo',
        'Done',
        'Developer', // Allowed role matches
        mockIssue,
      );
      expect(result.allowed).toBe(true);
    });

    it('should deny if role mismatch', async () => {
      statusesService.findByProjectAndName.mockResolvedValue({ id: 's2' });
      repo.find.mockResolvedValue([mockTransition]);

      const result = await service.isTransitionAllowed(
        'p1',
        'Todo',
        'Done',
        'Guest', // Role mismatch
        mockIssue,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Only Developer');
    });

    it('should valid conditions (story points)', async () => {
      const conditionRule = {
        ...mockTransition,
        conditions: { minStoryPoints: 8 },
      };
      statusesService.findByProjectAndName.mockResolvedValue({ id: 's2' });
      repo.find.mockResolvedValue([conditionRule]);

      const result = await service.isTransitionAllowed(
        'p1',
        'Todo',
        'Done',
        'Developer',
        mockIssue, // has 5 points, need 8
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('at least 8 story points');
    });
  });

  describe('create', () => {
    it('should create transition', async () => {
      statusesService.findById.mockResolvedValue({ id: 's1' });
      repo.create.mockReturnValue(mockTransition);
      repo.save.mockResolvedValue(mockTransition);

      const result = await service.create({
        projectId: 'p1',
        fromStatusId: 's1',
        toStatusId: 's2',
        name: 'Test',
      });

      expect(result).toEqual(mockTransition);
    });

    it('should throw NotFoundException if status not found', async () => {
      statusesService.findById.mockResolvedValue(null); // target missing

      await expect(
        service.create({
          projectId: 'p1',
          toStatusId: 'invalid',
          name: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvailableTransitions', () => {
    it('should return allowed transitions', async () => {
      statusesService.findByProjectAndName.mockResolvedValue({ id: 's1' });
      repo.find.mockResolvedValue([mockTransition]);

      const result = await service.getAvailableTransitions(
        'p1',
        'Todo',
        'Developer',
      );

      expect(result).toHaveLength(1);
      expect(result[0].toStatusName).toBe('Done');
    });

    it('should filter out restricted transitions', async () => {
      statusesService.findByProjectAndName.mockResolvedValue({ id: 's1' });
      repo.find.mockResolvedValue([mockTransition]); // requires Developer

      const result = await service.getAvailableTransitions(
        'p1',
        'Todo',
        'Guest', // Role mismatch
      );

      expect(result).toHaveLength(0);
    });
  });
});

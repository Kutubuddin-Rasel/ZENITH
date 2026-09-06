import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { SprintCommandService } from './sprint-command.service';
import { Sprint, SprintStatus } from '../entities/sprint.entity';
import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { ProjectLookupPort } from '../ports/project-lookup.port';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
  BOARD_COMMAND_TOKEN,
  BOARD_QUERY_TOKEN,
  BoardType,
} from '../../boards';
import { SPRINT_EVENT_FACTORY_TOKEN } from '../../common/constants/events.tokens';
import { SPRINT_SNAPSHOT_TOKEN } from '../constants/sprints.tokens';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('SprintCommandService', () => {
  let service: SprintCommandService;
  let sprintRepo: Mocked<AbstractSprintRepository>;
  let projectLookup: Mocked<ProjectLookupPort>;
  let members: { getUserRole: jest.Mock };
  let boardQuery: { findAll: jest.Mock };
  let boardCommand: { create: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let snapshotService: { captureSnapshot: jest.Mock };

  const plannedSprint = (): Partial<Sprint> => ({
    id: 'sprint-123',
    projectId: 'project-123',
    name: 'Sprint 1',
    status: SprintStatus.PLANNED,
    isActive: false,
  });

  beforeEach(async () => {
    sprintRepo = {
      findById: jest.fn(),
      findDetailById: jest.fn().mockResolvedValue(plannedSprint() as Sprint),
      findAllInProject: jest.fn(),
      findActiveInProject: jest.fn(),
      findRecentCompleted: jest.fn(),
      findAllActiveSystemWide: jest.fn(),
      findSprintIssue: jest.fn(),
      findSprintIssuesWithIssue: jest.fn(),
      findSprintIssuesOrdered: jest.fn(),
      aggregateSprintStats: jest.fn(),
      createEntity: jest.fn((d: Partial<Sprint>) => ({
        id: 'sprint-new',
        isActive: false,
        ...d,
      })),
      save: jest.fn((s: Sprint) => Promise.resolve(s)),
      remove: jest.fn(),
      createSprintIssue: jest.fn(),
      moveIssuesToSprint: jest.fn(),
      removeSprintIssue: jest.fn(),
      removeSprintIssues: jest.fn(),
    };
    projectLookup = { existsForTenant: jest.fn().mockResolvedValue(true) };
    members = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    };
    boardQuery = { findAll: jest.fn().mockResolvedValue([]) };
    boardCommand = { create: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    snapshotService = { captureSnapshot: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintCommandService,
        { provide: AbstractSprintRepository, useValue: sprintRepo },
        { provide: ProjectLookupPort, useValue: projectLookup },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: members },
        { provide: BOARD_QUERY_TOKEN, useValue: boardQuery },
        { provide: BOARD_COMMAND_TOKEN, useValue: boardCommand },
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: SPRINT_EVENT_FACTORY_TOKEN,
          useValue: { create: jest.fn((p: unknown) => p) },
        },
        { provide: SPRINT_SNAPSHOT_TOKEN, useValue: snapshotService },
      ],
    }).compile();

    service = module.get(SprintCommandService);
  });

  describe('create', () => {
    it('persists a planned sprint and emits without provisioning a board', async () => {
      const result = await service.create('project-123', 'user-123', {
        name: 'Sprint 1',
      } as never);
      expect(sprintRepo.save).toHaveBeenCalled();
      expect(boardCommand.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sprint.event',
        expect.objectContaining({ projectId: 'project-123' }),
      );
      expect(result.name).toBe('Sprint 1');
    });

    it('auto-provisions a KANBAN board when created ACTIVE', async () => {
      await service.create('project-123', 'user-123', {
        name: 'Sprint 1',
        status: SprintStatus.ACTIVE,
      } as never);
      expect(boardCommand.create).toHaveBeenCalledWith(
        'project-123',
        'user-123',
        expect.objectContaining({ type: BoardType.KANBAN }),
      );
    });

    it('throws NotFound when the project is absent for the tenant', async () => {
      projectLookup.existsForTenant.mockResolvedValueOnce(false);
      await expect(
        service.create('nope', 'user-123', { name: 'x' } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update / remove (lead-gated)', () => {
    it('throws Forbidden for non-leads on update', async () => {
      members.getUserRole.mockResolvedValueOnce(ProjectRole.DEVELOPER);
      await expect(
        service.update('project-123', 'sprint-123', 'user-123', {} as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('removes a sprint and emits for the lead', async () => {
      await service.remove('project-123', 'sprint-123', 'user-123');
      expect(sprintRepo.remove).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sprint.event',
        expect.any(Object),
      );
    });
  });

  describe('startSprint', () => {
    it('flips to ACTIVE, ensures a board, and captures the first snapshot', async () => {
      const result = await service.startSprint(
        'project-123',
        'sprint-123',
        'user-123',
      );
      expect(result.status).toBe(SprintStatus.ACTIVE);
      expect(result.isActive).toBe(true);
      expect(boardQuery.findAll).toHaveBeenCalled();
      expect(snapshotService.captureSnapshot).toHaveBeenCalledWith(
        'sprint-123',
      );
    });

    it('throws Forbidden for non-leads', async () => {
      members.getUserRole.mockResolvedValueOnce(ProjectRole.VIEWER);
      await expect(
        service.startSprint('project-123', 'sprint-123', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
      expect(snapshotService.captureSnapshot).not.toHaveBeenCalled();
    });
  });
});

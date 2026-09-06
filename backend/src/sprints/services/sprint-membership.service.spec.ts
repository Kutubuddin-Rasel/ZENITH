import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { SprintMembershipService } from './sprint-membership.service';
import { Sprint, SprintStatus } from '../entities/sprint.entity';
import { SprintIssue } from '../entities/sprint-issue.entity';
import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
  ISSUE_QUERY_TOKEN,
  ISSUE_TRANSITION_TOKEN,
  IssueStatus,
} from '../../issues';
import { SPRINT_EVENT_FACTORY_TOKEN } from '../../common/constants/events.tokens';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('SprintMembershipService', () => {
  let service: SprintMembershipService;
  let sprintRepo: Mocked<AbstractSprintRepository>;
  let members: { getUserRole: jest.Mock };
  let issuesService: { findOne: jest.Mock };
  let issueTransition: { updateStatus: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  // A sentinel manager so we can assert the SAME manager threads through
  // both the join write and the issue-status write (single transaction).
  const mockManager = { sentinel: 'tx-manager' };
  let dataSource: { transaction: jest.Mock };

  const mockSprint: Partial<Sprint> = {
    id: 'sprint-123',
    projectId: 'project-123',
    name: 'Sprint 1',
    status: SprintStatus.ACTIVE,
  };
  const mockSprintIssue: Partial<SprintIssue> = {
    id: 'si-123',
    sprintId: 'sprint-123',
    issueId: 'issue-123',
    sprintOrder: 0,
  };

  beforeEach(async () => {
    sprintRepo = {
      findById: jest.fn(),
      findDetailById: jest.fn().mockResolvedValue(mockSprint as Sprint),
      findAllInProject: jest.fn(),
      findActiveInProject: jest.fn(),
      findRecentCompleted: jest.fn(),
      findAllActiveSystemWide: jest.fn(),
      findSprintIssue: jest
        .fn()
        .mockResolvedValue(mockSprintIssue as SprintIssue),
      findSprintIssuesWithIssue: jest.fn(),
      findSprintIssuesOrdered: jest.fn(),
      aggregateSprintStats: jest.fn(),
      createEntity: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createSprintIssue: jest
        .fn()
        .mockResolvedValue(mockSprintIssue as SprintIssue),
      moveIssuesToSprint: jest.fn(),
      removeSprintIssue: jest.fn(),
      removeSprintIssues: jest.fn(),
    };
    members = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    };
    issuesService = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'issue-123', status: 'Backlog' }),
    };
    issueTransition = { updateStatus: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    dataSource = {
      transaction: jest.fn((cb: (m: typeof mockManager) => unknown) =>
        cb(mockManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintMembershipService,
        { provide: AbstractSprintRepository, useValue: sprintRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: members },
        { provide: ISSUE_QUERY_TOKEN, useValue: issuesService },
        { provide: ISSUE_TRANSITION_TOKEN, useValue: issueTransition },
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: SPRINT_EVENT_FACTORY_TOKEN,
          useValue: { create: jest.fn((p: unknown) => p) },
        },
      ],
    }).compile();

    service = module.get(SprintMembershipService);
  });

  describe('addIssue', () => {
    it('writes the join row on the transaction manager', async () => {
      await service.addIssue('project-123', 'sprint-123', 'user-123', {
        issueId: 'issue-123',
      });
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(sprintRepo.createSprintIssue).toHaveBeenCalledWith(
        { sprintId: 'sprint-123', issueId: 'issue-123', sprintOrder: 0 },
        mockManager,
      );
    });

    it('pulls a backlog issue to TODO via ISSUE_TRANSITION on the same manager', async () => {
      await service.addIssue('project-123', 'sprint-123', 'user-123', {
        issueId: 'issue-123',
      });
      // Directive A: no manager.update(Issue,...) — the issue domain owns it.
      expect(issueTransition.updateStatus).toHaveBeenCalledWith(
        'project-123',
        'issue-123',
        IssueStatus.TODO,
        'user-123',
        mockManager,
      );
    });

    it('does NOT touch issue status when the issue is not in the backlog', async () => {
      issuesService.findOne.mockResolvedValueOnce({
        id: 'issue-123',
        status: 'In Progress',
      });
      await service.addIssue('project-123', 'sprint-123', 'user-123', {
        issueId: 'issue-123',
      });
      expect(issueTransition.updateStatus).not.toHaveBeenCalled();
    });

    it('throws Forbidden for viewers', async () => {
      members.getUserRole.mockResolvedValueOnce(ProjectRole.VIEWER);
      await expect(
        service.addIssue('project-123', 'sprint-123', 'user-123', {
          issueId: 'issue-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('emits sprint.event after the transaction', async () => {
      await service.addIssue('project-123', 'sprint-123', 'user-123', {
        issueId: 'issue-123',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sprint.event',
        expect.objectContaining({ issueId: 'issue-123' }),
      );
    });
  });

  describe('removeIssue', () => {
    it('drops the join row AND resets status to Backlog on the same manager', async () => {
      await service.removeIssue('project-123', 'sprint-123', 'user-123', {
        issueId: 'issue-123',
      });
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(sprintRepo.removeSprintIssue).toHaveBeenCalledWith(
        mockSprintIssue,
        mockManager,
      );
      expect(issueTransition.updateStatus).toHaveBeenCalledWith(
        'project-123',
        'issue-123',
        IssueStatus.BACKLOG,
        'user-123',
        mockManager,
      );
    });

    it('throws NotFound when the issue is not in the sprint', async () => {
      sprintRepo.findSprintIssue.mockResolvedValueOnce(null);
      await expect(
        service.removeIssue('project-123', 'sprint-123', 'user-123', {
          issueId: 'absent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws Forbidden for viewers', async () => {
      members.getUserRole.mockResolvedValueOnce(ProjectRole.VIEWER);
      await expect(
        service.removeIssue('project-123', 'sprint-123', 'user-123', {
          issueId: 'issue-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { SprintLifecycleService } from './sprint-lifecycle.service';
import { Sprint, SprintStatus } from '../entities/sprint.entity';
import { SprintIssue } from '../entities/sprint-issue.entity';
import { Issue } from '../../issues/entities/issue.entity';
import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { ISSUE_TRANSITION_TOKEN, IssueStatus } from '../../issues';
import { SmartDefaultsService } from '../../user-preferences/services/smart-defaults.service';
import { SPRINT_EVENT_FACTORY_TOKEN } from '../../common/constants/events.tokens';
import { CACHE_INVALIDATOR_TOKEN } from '../../cache/constants/cache.tokens';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('SprintLifecycleService', () => {
  let service: SprintLifecycleService;
  let sprintRepo: Mocked<AbstractSprintRepository>;
  let members: { getUserRole: jest.Mock };
  let issueTransition: { updateStatus: jest.Mock };
  let smartDefaults: { learnFromBehavior: jest.Mock };
  let cacheInvalidator: { invalidateByTags: jest.Mock };

  const mockManager = { sentinel: 'tx-manager' };
  let dataSource: { transaction: jest.Mock };

  const activeSprint = (): Partial<Sprint> => ({
    id: 'sprint-active',
    projectId: 'project-123',
    name: 'Sprint 1',
    status: SprintStatus.ACTIVE,
    isActive: true,
  });
  const incomplete: Partial<SprintIssue> = {
    id: 'si-1',
    sprintId: 'sprint-active',
    issueId: 'issue-1',
    issue: { id: 'issue-1', status: 'In Progress' } as Issue,
  };

  beforeEach(async () => {
    sprintRepo = {
      findById: jest.fn(),
      findDetailById: jest.fn().mockResolvedValue(activeSprint() as Sprint),
      findAllInProject: jest.fn(),
      findActiveInProject: jest.fn(),
      findRecentCompleted: jest.fn(),
      findAllActiveSystemWide: jest.fn(),
      findSprintIssue: jest.fn(),
      findSprintIssuesWithIssue: jest
        .fn()
        .mockResolvedValue([incomplete as SprintIssue]),
      findSprintIssuesOrdered: jest.fn(),
      aggregateSprintStats: jest.fn(),
      createEntity: jest.fn(),
      save: jest.fn((s) => Promise.resolve(s as Sprint)),
      remove: jest.fn(),
      createSprintIssue: jest.fn(),
      moveIssuesToSprint: jest.fn(),
      removeSprintIssue: jest.fn(),
      removeSprintIssues: jest.fn(),
    };
    members = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    };
    issueTransition = { updateStatus: jest.fn() };
    smartDefaults = {
      learnFromBehavior: jest.fn().mockResolvedValue(undefined),
    };
    cacheInvalidator = { invalidateByTags: jest.fn() };
    dataSource = {
      transaction: jest.fn((cb: (m: typeof mockManager) => unknown) =>
        cb(mockManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintLifecycleService,
        { provide: AbstractSprintRepository, useValue: sprintRepo },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: members },
        { provide: DataSource, useValue: dataSource },
        { provide: ISSUE_TRANSITION_TOKEN, useValue: issueTransition },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: SPRINT_EVENT_FACTORY_TOKEN,
          useValue: { create: jest.fn((p: unknown) => p) },
        },
        { provide: SmartDefaultsService, useValue: smartDefaults },
        { provide: CACHE_INVALIDATOR_TOKEN, useValue: cacheInvalidator },
      ],
    }).compile();

    service = module.get(SprintLifecycleService);
  });

  it('completes the sprint inside a single transaction', async () => {
    const result = await service.archive(
      'project-123',
      'sprint-active',
      'user-123',
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(SprintStatus.COMPLETED);
    expect(result.isActive).toBe(false);
    expect(sprintRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SprintStatus.COMPLETED }),
      mockManager,
    );
  });

  it('rolls incomplete issues to the next sprint on the tx manager', async () => {
    sprintRepo.findActiveInProject.mockResolvedValueOnce({
      id: 'sprint-next',
      isActive: true,
    } as Sprint);

    await service.archive(
      'project-123',
      'sprint-active',
      'user-123',
      'sprint-next',
    );

    expect(sprintRepo.moveIssuesToSprint).toHaveBeenCalledWith(
      ['si-1'],
      'sprint-next',
      mockManager,
    );
    // Moving to a sprint does not reset issue status.
    expect(issueTransition.updateStatus).not.toHaveBeenCalled();
  });

  it('LATENT-BUG FIX: backlog rollover drops the join AND resets Issue.status', async () => {
    await service.archive('project-123', 'sprint-active', 'user-123');

    expect(sprintRepo.removeSprintIssues).toHaveBeenCalledWith(
      [incomplete],
      mockManager,
    );
    expect(issueTransition.updateStatus).toHaveBeenCalledWith(
      'project-123',
      'issue-1',
      IssueStatus.BACKLOG,
      'user-123',
      mockManager,
    );
  });

  it('throws BadRequest when the next sprint is invalid (no tx opened)', async () => {
    sprintRepo.findActiveInProject.mockResolvedValueOnce(null);
    await expect(
      service.archive('project-123', 'sprint-active', 'user-123', 'bogus'),
    ).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('throws Forbidden for non-leads', async () => {
    members.getUserRole.mockResolvedValueOnce(ProjectRole.DEVELOPER);
    await expect(
      service.archive('project-123', 'sprint-active', 'user-123'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('records completion behaviour and invalidates caches after commit', async () => {
    await service.archive('project-123', 'sprint-active', 'user-123');
    expect(smartDefaults.learnFromBehavior).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ action: 'sprint_completed' }),
    );
    expect(cacheInvalidator.invalidateByTags).toHaveBeenCalledWith([
      'sprint:sprint-active',
      'project:project-123',
    ]);
  });
});

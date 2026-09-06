import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { SprintQueryService } from './sprint-query.service';
import { Sprint, SprintStatus } from '../entities/sprint.entity';
import { SprintIssue } from '../entities/sprint-issue.entity';
import { Issue } from '../../issues/entities/issue.entity';
import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { AbstractSprintSnapshotRepository } from '../repositories/abstract/sprint-snapshot.repository.abstract';
import { ProjectLookupPort } from '../ports/project-lookup.port';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import { ProjectRole } from '../../membership/enums/project-role.enum';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('SprintQueryService', () => {
  let service: SprintQueryService;
  let sprintRepo: Mocked<AbstractSprintRepository>;
  let snapshotRepo: Mocked<AbstractSprintSnapshotRepository>;
  let projectLookup: Mocked<ProjectLookupPort>;
  let members: { getUserRole: jest.Mock };

  const mockSprint: Partial<Sprint> = {
    id: 'sprint-123',
    projectId: 'project-123',
    name: 'Sprint 1',
    status: SprintStatus.PLANNED,
    isActive: false,
  };
  const mockSprintIssue: Partial<SprintIssue> = {
    id: 'si-123',
    sprintId: 'sprint-123',
    issueId: 'issue-123',
    sprintOrder: 0,
    issue: { id: 'issue-123', status: 'To Do' } as Issue,
  };

  beforeEach(async () => {
    sprintRepo = {
      findById: jest.fn(),
      findDetailById: jest.fn().mockResolvedValue(mockSprint as Sprint),
      findAllInProject: jest.fn().mockResolvedValue([mockSprint as Sprint]),
      findActiveInProject: jest.fn(),
      findRecentCompleted: jest.fn(),
      findAllActiveSystemWide: jest.fn(),
      findSprintIssue: jest.fn(),
      findSprintIssuesWithIssue: jest.fn(),
      findSprintIssuesOrdered: jest
        .fn()
        .mockResolvedValue([mockSprintIssue as SprintIssue]),
      aggregateSprintStats: jest.fn(),
      createEntity: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createSprintIssue: jest.fn(),
      moveIssuesToSprint: jest.fn(),
      removeSprintIssue: jest.fn(),
      removeSprintIssues: jest.fn(),
    };
    snapshotRepo = {
      findBySprintAndDate: jest.fn(),
      findBySprintOrdered: jest.fn().mockResolvedValue([]),
      findLatestPerSprint: jest.fn(),
      createEntity: jest.fn(),
      save: jest.fn(),
    };
    projectLookup = { existsForTenant: jest.fn().mockResolvedValue(true) };
    members = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintQueryService,
        { provide: AbstractSprintRepository, useValue: sprintRepo },
        { provide: AbstractSprintSnapshotRepository, useValue: snapshotRepo },
        { provide: ProjectLookupPort, useValue: projectLookup },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: members },
      ],
    }).compile();

    service = module.get(SprintQueryService);
  });

  it('findAll returns sprints and gates on tenant existence', async () => {
    const result = await service.findAll('project-123', 'user-123');
    expect(result).toHaveLength(1);
    expect(sprintRepo.findAllInProject).toHaveBeenCalledWith(
      'project-123',
      undefined,
    );
  });

  it('findAll throws NotFound when project absent', async () => {
    projectLookup.existsForTenant.mockResolvedValueOnce(false);
    await expect(service.findAll('nope', 'user-123')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('findOne throws NotFound when sprint absent', async () => {
    sprintRepo.findDetailById.mockResolvedValueOnce(null);
    await expect(
      service.findOne('project-123', 'nope', 'user-123'),
    ).rejects.toThrow(NotFoundException);
  });

  it('findOne throws Forbidden for non-members', async () => {
    members.getUserRole.mockResolvedValueOnce(null);
    await expect(
      service.findOne('project-123', 'sprint-123', 'outsider'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('getSprintIssues returns ordered issues for members', async () => {
    const result = await service.getSprintIssues(
      'project-123',
      'sprint-123',
      'user-123',
    );
    expect(result).toEqual([mockSprintIssue.issue]);
    expect(sprintRepo.findSprintIssuesOrdered).toHaveBeenCalledWith(
      'sprint-123',
    );
  });

  it('getSprintIssues throws Forbidden for non-members', async () => {
    members.getUserRole.mockResolvedValueOnce(null);
    await expect(
      service.getSprintIssues('project-123', 'sprint-123', 'outsider'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('getSprintSnapshots delegates to the snapshot repository', async () => {
    await service.getSprintSnapshots('sprint-123');
    expect(snapshotRepo.findBySprintOrdered).toHaveBeenCalledWith('sprint-123');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ReleasesService } from './releases.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Release } from './entities/release.entity';
import { IssueRelease } from './entities/issue-release.entity';
import { ReleaseAttachment } from './entities/release-attachment.entity';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { IssuesService } from '../issues/issues.service';
import { WatchersService } from '../watchers/watchers.service';

describe('ReleasesService', () => {
  let service: ReleasesService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    remove: jest.fn(),
  };

  const mockProjectsService = {
    findOneById: jest.fn(),
  };

  const mockMembersService = {
    getUserRole: jest.fn(),
  };

  const mockIssuesService = {
    findOne: jest.fn(),
  };

  const mockWatchersService = {
    notifyWatchersOnEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReleasesService,
        { provide: getRepositoryToken(Release), useValue: mockRepo },
        { provide: getRepositoryToken(IssueRelease), useValue: mockRepo },
        { provide: getRepositoryToken(ReleaseAttachment), useValue: mockRepo },
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: ProjectMembersService, useValue: mockMembersService },
        { provide: IssuesService, useValue: mockIssuesService },
        { provide: WatchersService, useValue: mockWatchersService },
      ],
    }).compile();

    service = module.get<ReleasesService>(ReleasesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

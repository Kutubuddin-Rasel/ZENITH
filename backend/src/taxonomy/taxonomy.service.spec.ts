import { Test, TestingModule } from '@nestjs/testing';
import { TaxonomyService } from './taxonomy.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Label } from './entities/label.entity';
import { Component } from './entities/component.entity';
import { IssueLabel } from './entities/issue-label.entity';
import { IssueComponent } from './entities/issue-component.entity';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { IssuesService } from '../issues/issues.service';

describe('TaxonomyService', () => {
  let service: TaxonomyService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    remove: jest.fn(),
  };

  const mockProjectsService = { findOneById: jest.fn() };
  const mockMembersService = { getUserRole: jest.fn() };
  const mockIssuesService = { findOne: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxonomyService,
        { provide: getRepositoryToken(Label), useValue: mockRepo },
        { provide: getRepositoryToken(Component), useValue: mockRepo },
        { provide: getRepositoryToken(IssueLabel), useValue: mockRepo },
        { provide: getRepositoryToken(IssueComponent), useValue: mockRepo },
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: ProjectMembersService, useValue: mockMembersService },
        { provide: IssuesService, useValue: mockIssuesService },
      ],
    }).compile();

    service = module.get<TaxonomyService>(TaxonomyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

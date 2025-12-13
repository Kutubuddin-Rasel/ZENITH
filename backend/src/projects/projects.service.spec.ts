import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { Issue } from '../issues/entities/issue.entity';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { InvitesService } from '../invites/invites.service';
import { DataSource } from 'typeorm';

describe('ProjectsService', () => {
  let service: ProjectsService;

  const mockProjectRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockIssueRepo = {
    count: jest.fn(),
  };

  const mockProjectMembersService = {
    addMemberToProject: jest.fn(),
  };

  const mockInvitesService = {};

  const mockDataSource = {
    getRepository: jest.fn().mockReturnValue(mockIssueRepo),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepo,
        },
        {
          provide: getRepositoryToken(Issue),
          useValue: mockIssueRepo,
        },
        {
          provide: ProjectMembersService,
          useValue: mockProjectMembersService,
        },
        {
          provide: InvitesService,
          useValue: mockInvitesService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a project and assign the creator as owner', async () => {
      const userId = 'user-1';
      const organizationId = 'org-1';
      const dto = { name: 'Test Project', key: 'TEST' };
      const savedProject = { id: 'proj-1', ...dto, organizationId };

      mockProjectRepo.create.mockReturnValue(savedProject);
      mockProjectRepo.save.mockReturnValue(savedProject);

      const result = await service.create(userId, dto, organizationId);

      expect(mockProjectRepo.create).toHaveBeenCalledWith({
        ...dto,
        organizationId,
      });
      expect(mockProjectRepo.save).toHaveBeenCalled();
      expect(mockProjectMembersService.addMemberToProject).toHaveBeenCalledWith(
        {
          projectId: 'proj-1',
          userId,
          roleName: 'ProjectLead',
        },
      );
      expect(result).toEqual(savedProject);
    });
  });
});

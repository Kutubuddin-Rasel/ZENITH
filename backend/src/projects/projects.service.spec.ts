import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { Issue } from '../issues/entities/issue.entity';
import { ProjectAccessSettings } from './entities/project-access-settings.entity';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { InvitesService } from '../invites/invites.service';
import { DataSource } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { AuditLogsService } from '../audit/audit-logs.service';
import { TenantContext, TenantRepositoryFactory } from '../core/tenant';
import { ClsService } from 'nestjs-cls';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { ProjectTemplate } from '../project-templates/entities/project-template.entity';

describe('ProjectsService', () => {
  let service: ProjectsService;

  const mockProjectRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    remove: jest.fn(),
    query: jest.fn(),
  };

  const mockIssueRepo = {
    count: jest.fn(),
  };

  const mockAccessSettingsRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockProjectMembersService = {
    addMemberToProject: jest.fn(),
  };

  const mockInvitesService = {};

  const mockDataSource = {
    getRepository: jest.fn().mockReturnValue(mockIssueRepo),
  };

  const mockCacheService = {
    getCachedProject: jest.fn(),
    cacheProject: jest.fn(),
    invalidateProjectCache: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockAuditLogsService = {
    log: jest.fn(),
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue('org-1'),
  };

  const mockTenantRepoFactory = {
    create: jest.fn().mockReturnValue(mockProjectRepo),
  };

  const mockClsService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: mockProjectRepo },
        { provide: getRepositoryToken(Issue), useValue: mockIssueRepo },
        {
          provide: getRepositoryToken(ProjectAccessSettings),
          useValue: mockAccessSettingsRepo,
        },
        { provide: getRepositoryToken(ProjectTemplate), useValue: {} },
        { provide: ProjectMembersService, useValue: mockProjectMembersService },
        { provide: InvitesService, useValue: mockInvitesService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: CacheService, useValue: mockCacheService },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: TenantRepositoryFactory, useValue: mockTenantRepoFactory },
        { provide: ClsService, useValue: mockClsService },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    // Manually trigger OnModuleInit if needed, though testing module usually handles it if lifecycle hooks enabled.
    // But since we are mocking factory, we might need to manually ensure internal props are set if logic depends on them.
    service.onModuleInit();
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

      const result = await service.create(userId, dto); // REMOVED organizationId arg

      expect(mockProjectRepo.create).toHaveBeenCalledWith({
        ...dto,
        organizationId,
      });
      expect(mockProjectRepo.save).toHaveBeenCalled();
      expect(mockProjectMembersService.addMemberToProject).toHaveBeenCalledWith(
        {
          projectId: 'proj-1',
          userId,
          roleName: ProjectRole.PROJECT_LEAD,
        },
      );
      expect(result).toEqual(savedProject);
    });
  });
});

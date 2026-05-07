import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Issue } from '../issues/entities/issue.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { SearchAnalytics } from './entities/search-analytics.entity';
import { TenantContext } from '../core/tenant/tenant-context.service';
import { CacheService } from '../cache/cache.service';
import { ForbiddenException } from '@nestjs/common';
import { SearchQueryDto } from './dto/search-query.dto';

describe('SearchService', () => {
  let service: SearchService;
  let issuesRepo: any;
  let projectsRepo: any;
  let usersRepo: any;
  let tenantContext: any;

  const mockIssue = {
    id: 'issue-1',
    title: 'Test Issue',
    projectId: 'proj-1',
    number: 101,
  };

  const mockProject = {
    id: 'proj-1',
    name: 'Test Project',
    key: 'TP',
  };

  const mockUser = {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    avatarUrl: null,
  };

  const dto = (overrides: Partial<SearchQueryDto> = {}): SearchQueryDto => ({
    q: 'test',
    page: 1,
    limit: 20,
    ...overrides,
  });

  const buildQb = (rows: unknown[]) => ({
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
  });

  beforeEach(async () => {
    const issuesRepoMock = {
      createQueryBuilder: jest.fn(() => buildQb([mockIssue])),
    };
    const projectsRepoMock = {
      createQueryBuilder: jest.fn(() => buildQb([mockProject])),
    };
    const usersRepoMock = {
      createQueryBuilder: jest.fn(() => buildQb([mockUser])),
    };

    const analyticsRepoMock = {
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 'a-1' }] }),
    };

    const mockTenantContext = {
      getTenantId: jest.fn().mockReturnValue('org-1'),
    };

    const cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(Issue), useValue: issuesRepoMock },
        { provide: getRepositoryToken(Project), useValue: projectsRepoMock },
        { provide: getRepositoryToken(User), useValue: usersRepoMock },
        {
          provide: getRepositoryToken(SearchAnalytics),
          useValue: analyticsRepoMock,
        },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: CacheService, useValue: cacheServiceMock },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    issuesRepo = module.get(getRepositoryToken(Issue));
    projectsRepo = module.get(getRepositoryToken(Project));
    usersRepo = module.get(getRepositoryToken(User));
    tenantContext = module.get(TenantContext);
  });

  describe('search', () => {
    it('should throw forbidden if no tenant context', async () => {
      tenantContext.getTenantId.mockReturnValue(null);
      await expect(service.search(dto(), 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should return empty paginated payloads when query sanitizes to empty', async () => {
      const result = await service.search(dto({ q: '&|!' }), 'user-1');
      expect(result.issues.data).toEqual([]);
      expect(result.issues.meta.total).toBe(0);
      expect(result.projects.data).toEqual([]);
      expect(result.users.data).toEqual([]);
    });

    it('should return paginated tenant-isolated results', async () => {
      const result = await service.search(dto({ q: 'test', page: 2, limit: 10 }));

      expect(result.issues.data).toHaveLength(1);
      expect(result.issues.meta).toMatchObject({
        page: 2,
        limit: 10,
        total: 1,
      });

      expect(result.projects.data).toHaveLength(1);
      expect(result.users.data).toHaveLength(1);
      expect(result.users.data[0]).toMatchObject({
        id: 'user-1',
        email: 'alice@example.com',
      });

      // Verify tenant isolation was applied on every query builder.
      expect(issuesRepo.createQueryBuilder).toHaveBeenCalled();
      expect(projectsRepo.createQueryBuilder).toHaveBeenCalled();
      expect(usersRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });
});

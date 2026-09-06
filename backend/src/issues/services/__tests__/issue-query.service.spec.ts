import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { IssueQueryService } from '../issue-query.service';
import { IssueAuthzService } from '../issue-authz.service';
import { IssueKeyService } from '../issue-key.service';
import { IssueRepository } from '../../../database/repositories/issue.repository';
import { IssueLinkRepository } from '../../../database/repositories/issue-link.repository';
import { ProjectRepository } from '../../../database/repositories/project.repository';
import { CACHE_STORE_TOKEN } from '../../../cache/constants/cache.tokens';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../../membership/constants/membership.tokens';
import { Issue } from '../../entities/issue.entity';

/**
 * IssueQueryService — read-side regression suite (ported from the deleted
 * `issues.service.spec.ts` god-class spec, Step 4).
 *
 * Locks in the read-side tenant isolation + membership guards + the
 * cache-through path (including the legacy whitespace cache key
 * `issue:${id} `) so the decomposed service stays behaviour-identical to
 * the god class it replaced.
 */
describe('IssueQueryService', () => {
  let service: IssueQueryService;

  const mockIssueRepo = {
    findFilteredByProject: jest.fn(),
    findOne: jest.fn(),
    streamForExport: jest.fn(),
  };
  const mockIssueLinkRepo = { findForIssue: jest.fn() };
  const mockProjects = { findOne: jest.fn() };
  const mockAuthz = { requireMember: jest.fn() };
  const mockKeyService = { findTenantProject: jest.fn() };
  const mockCache = { get: jest.fn(), set: jest.fn() };
  const mockMembers = { getUserRole: jest.fn() };

  const issue = (overrides: Partial<Issue> = {}): Issue =>
    ({
      id: 'issue-1',
      projectId: 'proj-1',
      project: { organizationId: 'org-1' },
      ...overrides,
    }) as unknown as Issue;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueQueryService,
        { provide: IssueRepository, useValue: mockIssueRepo },
        { provide: IssueLinkRepository, useValue: mockIssueLinkRepo },
        { provide: ProjectRepository, useValue: mockProjects },
        { provide: IssueAuthzService, useValue: mockAuthz },
        { provide: IssueKeyService, useValue: mockKeyService },
        { provide: CACHE_STORE_TOKEN, useValue: mockCache },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: mockMembers },
      ],
    }).compile();

    service = module.get(IssueQueryService);
  });

  describe('findAll', () => {
    it('throws NotFoundException when the project is out of tenant', async () => {
      mockKeyService.findTenantProject.mockResolvedValue(null);

      await expect(service.findAll('proj-1', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockIssueRepo.findFilteredByProject).not.toHaveBeenCalled();
    });

    it('returns the filtered issue list for an in-tenant project', async () => {
      mockKeyService.findTenantProject.mockResolvedValue({ id: 'proj-1' });
      const rows = [issue()];
      mockIssueRepo.findFilteredByProject.mockResolvedValue(rows);

      await expect(
        service.findAll('proj-1', 'user-1', { assigneeId: 'user-1' }),
      ).resolves.toBe(rows);
    });
  });

  describe('findOne', () => {
    it('re-checks membership on a cache hit and throws Forbidden when the role was revoked', async () => {
      mockCache.get.mockResolvedValue(issue());
      mockMembers.getUserRole.mockResolvedValue(null);

      await expect(
        service.findOne('proj-1', 'issue-1', 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException on a cache miss when the row is absent', async () => {
      mockCache.get.mockResolvedValue(undefined);
      mockIssueRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('proj-1', 'issue-1', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('caches under the legacy `issue:${id} ` key and returns the row for a member', async () => {
      mockCache.get.mockResolvedValue(undefined);
      const row = issue();
      mockIssueRepo.findOne.mockResolvedValue(row);
      mockMembers.getUserRole.mockResolvedValue('MEMBER');

      const result = await service.findOne('proj-1', 'issue-1', 'user-1');

      expect(result).toBe(row);
      expect(mockCache.set).toHaveBeenCalledWith(
        'issue:issue-1 ',
        row,
        expect.objectContaining({ ttl: 900 }),
      );
    });
  });

  describe('getLinks', () => {
    it('enforces access via findOne then returns the links', async () => {
      mockCache.get.mockResolvedValue(issue());
      mockMembers.getUserRole.mockResolvedValue('MEMBER');
      const links = [{ id: 'link-1' }];
      mockIssueLinkRepo.findForIssue.mockResolvedValue(links);

      await expect(
        service.getLinks('proj-1', 'issue-1', 'user-1'),
      ).resolves.toBe(links);
      expect(mockIssueLinkRepo.findForIssue).toHaveBeenCalledWith('issue-1');
    });
  });

  describe('getIssuesStream', () => {
    it('throws NotFoundException when the org-scoped project is absent', async () => {
      mockProjects.findOne.mockResolvedValue(null);

      await expect(
        service.getIssuesStream('proj-1', 'user-1', 'org-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockAuthz.requireMember).not.toHaveBeenCalled();
    });

    it('requires membership and streams for export', async () => {
      const stream = {} as NodeJS.ReadableStream;
      mockAuthz.requireMember.mockResolvedValue('proj-1');
      mockIssueRepo.streamForExport.mockReturnValue(stream);

      await expect(service.getIssuesStream('proj-1', 'user-1')).resolves.toBe(
        stream,
      );
      expect(mockAuthz.requireMember).toHaveBeenCalledWith('proj-1', 'user-1');
    });
  });
});

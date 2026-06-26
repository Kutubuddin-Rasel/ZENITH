import { Test, TestingModule } from '@nestjs/testing';

import { BacklogQueryService } from '../backlog-query.service';
import { BacklogReadRepository } from '../../repositories/abstract/backlog-read.repository.abstract';
import { BacklogCacheService } from '../backlog-cache.service';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../../membership/constants/membership.tokens';
import type { IssueView } from '../../../issues';
import type { PaginatedBacklogResponse } from '../../interfaces/backlog.interfaces';

/**
 * BacklogQueryService — cached read-surface suite.
 *
 * Asserts: membership is checked; a cache hit short-circuits the repo; a
 * cache miss reads the projection, builds the paginated response, and writes
 * it back to the cache.
 */
describe('BacklogQueryService', () => {
  let service: BacklogQueryService;

  const mockMembers = { getUserRole: jest.fn() };
  const mockReads = { findBacklogPage: jest.fn() };
  const mockCache = { readPage: jest.fn(), writePage: jest.fn() };

  const view = (id: string): IssueView => ({ id }) as unknown as IssueView;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMembers.getUserRole.mockResolvedValue('MEMBER');
    mockCache.readPage.mockResolvedValue(null);
    mockCache.writePage.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BacklogQueryService,
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: mockMembers },
        { provide: BacklogReadRepository, useValue: mockReads },
        { provide: BacklogCacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get(BacklogQueryService);
  });

  it('returns the cached page without hitting the repository', async () => {
    const cached: PaginatedBacklogResponse<IssueView> = {
      data: [view('a')],
      meta: {
        page: 1,
        limit: 50,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
    mockCache.readPage.mockResolvedValue(cached);

    const result = await service.getBacklog('p1', 'u1');

    expect(result).toBe(cached);
    expect(mockMembers.getUserRole).toHaveBeenCalledWith('p1', 'u1');
    expect(mockReads.findBacklogPage).not.toHaveBeenCalled();
    expect(mockCache.writePage).not.toHaveBeenCalled();
  });

  it('reads the projection on a miss, paginates, and caches the result', async () => {
    mockReads.findBacklogPage.mockResolvedValue([[view('a'), view('b')], 2]);

    const result = await service.getBacklog('p1', 'u1', { page: 1, limit: 50 });

    // skip = (page-1)*limit = 0
    expect(mockReads.findBacklogPage).toHaveBeenCalledWith('p1', 0, 50);
    expect(result.data.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.meta.total).toBe(2);
    expect(mockCache.writePage).toHaveBeenCalledWith('p1', 1, 50, result);
  });

  it('applies the default page/limit and computes skip for page 2', async () => {
    mockReads.findBacklogPage.mockResolvedValue([[], 0]);

    await service.getBacklog('p1', 'u1', { page: 2, limit: 50 });

    expect(mockReads.findBacklogPage).toHaveBeenCalledWith('p1', 50, 50);
  });
});

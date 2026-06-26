import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';

import { BacklogOrderingService } from '../backlog-ordering.service';
import { BacklogCacheService } from '../backlog-cache.service';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../../membership/constants/membership.tokens';
import { ISSUE_RANKING_TOKEN } from '../../../issues';
import { ProjectRole } from '../../../membership/enums/project-role.enum';

/**
 * BacklogOrderingService — write-surface authorization + delegation suite.
 *
 * Asserts the role rules (move → PROJECT_LEAD only; reorder → LEAD or MEMBER),
 * that every Issue-row write is DELEGATED to `ISSUE_RANKING_TOKEN` (the single
 * writer), and that the cache is invalidated only after a successful mutation.
 */
describe('BacklogOrderingService', () => {
  let service: BacklogOrderingService;

  const mockMembers = { getUserRole: jest.fn() };
  const mockRanking = {
    moveBacklogItem: jest.fn(),
    reorderBacklog: jest.fn(),
  };
  const mockCache = { invalidate: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCache.invalidate.mockResolvedValue(undefined);
    mockRanking.moveBacklogItem.mockResolvedValue([]);
    mockRanking.reorderBacklog.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BacklogOrderingService,
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: mockMembers },
        { provide: ISSUE_RANKING_TOKEN, useValue: mockRanking },
        { provide: BacklogCacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get(BacklogOrderingService);
  });

  describe('moveItem', () => {
    it('delegates to the ranking token and invalidates the cache (PROJECT_LEAD)', async () => {
      mockMembers.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);

      await service.moveItem('p1', 'u1', { issueId: 'i1', newPosition: 3 });

      expect(mockRanking.moveBacklogItem).toHaveBeenCalledWith('p1', 'i1', 3);
      expect(mockCache.invalidate).toHaveBeenCalledWith('p1');
    });

    it('forbids a non-lead and never writes', async () => {
      mockMembers.getUserRole.mockResolvedValue(ProjectRole.MEMBER);

      await expect(
        service.moveItem('p1', 'u1', { issueId: 'i1', newPosition: 0 }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRanking.moveBacklogItem).not.toHaveBeenCalled();
      expect(mockCache.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('reorderItems', () => {
    it('delegates and invalidates for a MEMBER', async () => {
      mockMembers.getUserRole.mockResolvedValue(ProjectRole.MEMBER);

      await service.reorderItems('p1', 'u1', ['a', 'b']);

      expect(mockRanking.reorderBacklog).toHaveBeenCalledWith('p1', ['a', 'b']);
      expect(mockCache.invalidate).toHaveBeenCalledWith('p1');
    });

    it('is a no-op for an empty list (no write, no invalidation)', async () => {
      mockMembers.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);

      await service.reorderItems('p1', 'u1', []);

      expect(mockRanking.reorderBacklog).not.toHaveBeenCalled();
      expect(mockCache.invalidate).not.toHaveBeenCalled();
    });

    it('forbids a viewer/guest role', async () => {
      mockMembers.getUserRole.mockResolvedValue(ProjectRole.VIEWER);

      await expect(service.reorderItems('p1', 'u1', ['a'])).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRanking.reorderBacklog).not.toHaveBeenCalled();
    });
  });
});

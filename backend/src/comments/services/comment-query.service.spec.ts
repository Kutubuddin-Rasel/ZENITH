// src/comments/services/comment-query.service.spec.ts
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CommentQueryService } from './comment-query.service';
import { ProjectRole } from '../../membership/enums/project-role.enum';

const c1 = {
  id: 'c1',
  issueId: 'i1',
  authorId: 'u1',
  content: 'hi',
  createdAt: new Date('2026-06-04T10:00:00.000Z'),
  updatedAt: new Date('2026-06-04T10:00:00.000Z'),
};
const c2 = { ...c1, id: 'c2', createdAt: new Date('2026-06-04T10:01:00.000Z') };
const c3 = { ...c1, id: 'c3', createdAt: new Date('2026-06-04T10:02:00.000Z') };

describe('CommentQueryService', () => {
  let repo: any;
  let issues: any;
  let members: any;
  let sut: CommentQueryService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      listOffset: jest.fn(),
      listKeyset: jest.fn(),
      remove: jest.fn(),
    };
    issues = { findOne: jest.fn() };
    members = { getUserRole: jest.fn() };
    sut = new CommentQueryService(repo, issues, members);
  });

  describe('findAll (offset)', () => {
    it('enforces issue access then returns the paginated shape', async () => {
      issues.findOne.mockResolvedValue({ id: 'i1' });
      repo.listOffset.mockResolvedValue([[c1], 1]);

      const out = await sut.findAll('p1', 'i1', 'u1', { page: 1, limit: 20 });

      expect(issues.findOne).toHaveBeenCalledWith('p1', 'i1', 'u1');
      expect(repo.listOffset).toHaveBeenCalledWith('i1', 0, 20);
      expect(out.data).toEqual([c1]);
      expect(out.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });
  });

  describe('findAllKeyset', () => {
    it('fetches limit+1, trims, and emits nextCursor when more exist', async () => {
      issues.findOne.mockResolvedValue({ id: 'i1' });
      repo.listKeyset.mockResolvedValue([c1, c2, c3]); // limit=2 -> 3 fetched

      const out = await sut.findAllKeyset('p1', 'i1', 'u1', 2, undefined);

      expect(out.data).toHaveLength(2);
      expect(out.nextCursor).not.toBeNull();
      expect(repo.listKeyset).toHaveBeenCalledWith('i1', 3, undefined); // limit+1
    });

    it('returns nextCursor=null when no further rows', async () => {
      issues.findOne.mockResolvedValue({ id: 'i1' });
      repo.listKeyset.mockResolvedValue([c1, c2]); // limit=2 -> only 2 fetched

      const out = await sut.findAllKeyset('p1', 'i1', 'u1', 2, undefined);

      expect(out.data).toHaveLength(2);
      expect(out.nextCursor).toBeNull();
    });
  });

  describe('assertEditable', () => {
    it('throws NotFound when the comment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(sut.assertEditable('p1', 'i1', 'c1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws Forbidden for non-author non-lead and writes nothing', async () => {
      repo.findOne.mockResolvedValue({ ...c1, authorId: 'owner' });
      issues.findOne.mockResolvedValue({ id: 'i1' });
      members.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);

      await expect(
        sut.assertEditable('p1', 'i1', 'c1', 'intruder'),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('returns the comment for the author', async () => {
      repo.findOne.mockResolvedValue({ ...c1, authorId: 'u1' });
      issues.findOne.mockResolvedValue({ id: 'i1' });
      members.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);

      await expect(
        sut.assertEditable('p1', 'i1', 'c1', 'u1'),
      ).resolves.toMatchObject({ id: 'c1' });
    });

    it('returns the comment for a PROJECT_LEAD acting on someone else’s comment', async () => {
      repo.findOne.mockResolvedValue({ ...c1, authorId: 'owner' });
      issues.findOne.mockResolvedValue({ id: 'i1' });
      members.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);

      await expect(
        sut.assertEditable('p1', 'i1', 'c1', 'lead'),
      ).resolves.toMatchObject({ id: 'c1' });
    });
  });
});

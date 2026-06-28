// src/comments/services/comment-command.service.spec.ts
import { ForbiddenException } from '@nestjs/common';
import { CommentCommandService } from './comment-command.service';

const saved = {
  id: 'c1',
  issueId: 'i1',
  authorId: 'u1',
  content: 'hi',
  createdAt: new Date('2026-06-04T10:00:00.000Z'),
  updatedAt: new Date('2026-06-04T10:00:00.000Z'),
};

describe('CommentCommandService', () => {
  let repo: any;
  let query: any;
  let issues: any;
  let audit: any;
  let notifications: any;
  let sut: CommentCommandService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    query = { assertEditable: jest.fn() };
    issues = { findOne: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      notifyWatchersOnEvent: jest.fn().mockResolvedValue(undefined),
    };
    sut = new CommentCommandService(repo, query, issues, audit, notifications);
  });

  describe('create', () => {
    it('validates issue access, persists, audits CREATE, and notifies "commented"', async () => {
      issues.findOne.mockResolvedValue({ id: 'i1' });
      repo.create.mockReturnValue(saved);
      repo.save.mockResolvedValue(saved);

      const out = await sut.create('p1', 'i1', 'u1', { content: 'hi' });

      expect(issues.findOne).toHaveBeenCalledWith('p1', 'i1', 'u1');
      expect(repo.save).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'CREATE',
          resource_type: 'Comment',
          resource_id: 'c1',
        }),
      );
      expect(notifications.notifyWatchersOnEvent).toHaveBeenCalledWith(
        'p1',
        'i1',
        'commented',
        'u1',
      );
      expect(out).toBe(saved);
    });

    it('throws when issue access is denied (no persist)', async () => {
      issues.findOne.mockRejectedValue(new ForbiddenException());
      await expect(
        sut.create('p1', 'i1', 'u1', { content: 'hi' }),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('delegates authz to query.assertEditable then saves, audits UPDATE, notifies', async () => {
      query.assertEditable.mockResolvedValue({ ...saved, content: 'old' });
      repo.save.mockResolvedValue({ ...saved, content: 'new' });

      const out = await sut.update('p1', 'i1', 'c1', 'u1', { content: 'new' });

      expect(query.assertEditable).toHaveBeenCalledWith('p1', 'i1', 'c1', 'u1');
      expect(out.content).toBe('new');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'UPDATE',
          resource_type: 'Comment',
        }),
      );
      expect(notifications.notifyWatchersOnEvent).toHaveBeenCalledWith(
        'p1',
        'i1',
        'edited a comment',
        'u1',
      );
    });

    it('propagates Forbidden from assertEditable without saving', async () => {
      query.assertEditable.mockRejectedValue(new ForbiddenException());
      await expect(
        sut.update('p1', 'i1', 'c1', 'intruder', { content: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('delegates authz to assertEditable then removes, audits DELETE, notifies', async () => {
      query.assertEditable.mockResolvedValue(saved);

      await sut.remove('p1', 'i1', 'c1', 'u1');

      expect(query.assertEditable).toHaveBeenCalledWith('p1', 'i1', 'c1', 'u1');
      expect(repo.remove).toHaveBeenCalledWith(saved);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'DELETE',
          resource_type: 'Comment',
        }),
      );
      expect(notifications.notifyWatchersOnEvent).toHaveBeenCalledWith(
        'p1',
        'i1',
        'deleted a comment',
        'u1',
      );
    });
  });
});

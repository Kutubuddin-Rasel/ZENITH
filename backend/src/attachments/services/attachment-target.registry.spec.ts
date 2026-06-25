import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttachmentTargetRegistry } from './attachment-target.registry';
import type { AttachmentContext } from '../interfaces/attachments.interfaces';

describe('AttachmentTargetRegistry', () => {
  const issueQuery = { findOne: jest.fn() };
  const sprintQuery = { findOne: jest.fn() };
  const releaseQuery = { findOne: jest.fn() };
  const commentQuery = { assertEditable: jest.fn() };
  const memberQuery = { getUserRole: jest.fn() };

  const build = () =>
    new AttachmentTargetRegistry(
      issueQuery as never,
      sprintQuery as never,
      releaseQuery as never,
      commentQuery as never,
      memberQuery as never,
    );

  beforeEach(() => jest.clearAllMocks());

  it('maps each target to its FK column', () => {
    const reg = build();
    expect(reg.resolve('project').column).toBe('projectId');
    expect(reg.resolve('issue').column).toBe('issueId');
    expect(reg.resolve('release').column).toBe('releaseId');
    expect(reg.resolve('sprint').column).toBe('sprintId');
    expect(reg.resolve('comment').column).toBe('commentId');
  });

  it('throws BadRequest for an unknown target', () => {
    expect(() => build().resolve('epic')).toThrow(BadRequestException);
  });

  it('issue.assertParent routes through ISSUE_QUERY_TOKEN.findOne', async () => {
    issueQuery.findOne.mockResolvedValue({ id: 'i1' });
    const ctx: AttachmentContext = {
      target: 'issue',
      projectId: 'p1',
      parentId: 'i1',
      userId: 'u1',
    };
    await build().resolve('issue').assertParent(ctx);
    expect(issueQuery.findOne).toHaveBeenCalledWith('p1', 'i1', 'u1');
  });

  it('comment.assertParent routes through COMMENT_QUERY_TOKEN.assertEditable (issue + comment ids)', async () => {
    commentQuery.assertEditable.mockResolvedValue({ id: 'c1' });
    const ctx: AttachmentContext = {
      target: 'comment',
      projectId: 'p1',
      issueId: 'i1',
      parentId: 'c1',
      userId: 'u1',
    };
    await build().resolve('comment').assertParent(ctx);
    expect(commentQuery.assertEditable).toHaveBeenCalledWith(
      'p1',
      'i1',
      'c1',
      'u1',
    );
  });

  it('project.assertParent allows a member and forbids a non-member', async () => {
    const ctx: AttachmentContext = {
      target: 'project',
      projectId: 'p1',
      parentId: 'p1',
      userId: 'u1',
    };
    memberQuery.getUserRole.mockResolvedValueOnce('Developer');
    await expect(
      build().resolve('project').assertParent(ctx),
    ).resolves.toBeUndefined();

    memberQuery.getUserRole.mockResolvedValueOnce(null);
    await expect(
      build().resolve('project').assertParent(ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

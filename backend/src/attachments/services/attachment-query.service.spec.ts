import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttachmentQueryService } from './attachment-query.service';
import type {
  AttachmentContext,
  AttachmentView,
} from '../interfaces/attachments.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';

describe('AttachmentQueryService', () => {
  const assertParent = jest.fn();
  const registry = {
    resolve: jest.fn(() => ({ column: 'issueId', assertParent })),
  };
  const repo = {
    findByTarget: jest.fn(),
    findOneByTarget: jest.fn(),
    listHistory: jest.fn(),
  };
  const memberQuery = { getUserRole: jest.fn() };

  const build = () =>
    new AttachmentQueryService(
      registry as never,
      repo as never,
      memberQuery as never,
    );

  const att = { id: 'a1', filename: 'f.png' } as AttachmentView;

  beforeEach(() => jest.clearAllMocks());

  it('listForTarget guards the parent then lists by the resolved column', async () => {
    const ctx: AttachmentContext = {
      target: 'issue',
      projectId: 'p1',
      parentId: 'i1',
      userId: 'u1',
    };
    repo.findByTarget.mockResolvedValue([att]);

    const out = await build().listForTarget(ctx);

    expect(assertParent).toHaveBeenCalledWith(ctx);
    expect(repo.findByTarget).toHaveBeenCalledWith('issueId', 'i1', true);
    expect(out).toEqual([att]);
  });

  it('listForTarget falls back to projectId as the value for a project target', async () => {
    registry.resolve.mockReturnValueOnce({ column: 'projectId', assertParent });
    const ctx: AttachmentContext = {
      target: 'project',
      projectId: 'p1',
      userId: 'u1',
    };
    repo.findByTarget.mockResolvedValue([]);

    await build().listForTarget(ctx);

    expect(repo.findByTarget).toHaveBeenCalledWith('projectId', 'p1', true);
  });

  it('getHistory forbids a non-lead member', async () => {
    memberQuery.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);
    await expect(build().getHistory('p1', 'u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.listHistory).not.toHaveBeenCalled();
  });

  it('getHistory returns rows for a project lead', async () => {
    memberQuery.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);
    repo.listHistory.mockResolvedValue([{ id: 'h1' }]);
    const out = await build().getHistory('p1', 'u1');
    expect(repo.listHistory).toHaveBeenCalledWith('p1');
    expect(out).toEqual([{ id: 'h1' }]);
  });

  it('findForDownload enforces membership (Forbidden for a non-member)', async () => {
    registry.resolve.mockReturnValueOnce({ column: 'projectId', assertParent });
    memberQuery.getUserRole.mockResolvedValue(null);
    const ctx: AttachmentContext = {
      target: 'project',
      projectId: 'p1',
      userId: 'stranger',
    };
    await expect(build().findForDownload(ctx, 'a1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.findOneByTarget).not.toHaveBeenCalled();
  });

  it('findForDownload throws NotFound when the attachment is absent', async () => {
    registry.resolve.mockReturnValueOnce({ column: 'projectId', assertParent });
    memberQuery.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);
    repo.findOneByTarget.mockResolvedValue(null);
    const ctx: AttachmentContext = {
      target: 'project',
      projectId: 'p1',
      userId: 'u1',
    };
    await expect(
      build().findForDownload(ctx, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findForDownload returns the attachment for a member', async () => {
    registry.resolve.mockReturnValueOnce({ column: 'projectId', assertParent });
    memberQuery.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);
    repo.findOneByTarget.mockResolvedValue(att);
    const ctx: AttachmentContext = {
      target: 'project',
      projectId: 'p1',
      userId: 'u1',
    };
    const out = await build().findForDownload(ctx, 'a1');
    expect(repo.findOneByTarget).toHaveBeenCalledWith('projectId', 'p1', 'a1');
    expect(out).toBe(att);
  });
});

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttachmentCommandService } from './attachment-command.service';
import type {
  AttachmentContext,
  AttachmentView,
  NewAttachment,
  UploadedFileMeta,
} from '../interfaces/attachments.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';

describe('AttachmentCommandService', () => {
  const assertParent = jest.fn();
  const registry = {
    resolve: jest.fn(() => ({ column: 'issueId', assertParent })),
  };
  const repo = {
    create: jest.fn((d: NewAttachment) => d),
    save: jest.fn((d: NewAttachment) => Promise.resolve({ id: 'a1', ...d })),
    appendHistory: jest.fn(),
    remove: jest.fn(),
    findOneByTarget: jest.fn(),
  };
  const storage = { upload: jest.fn(), delete: jest.fn() };
  const memberQuery = { getUserRole: jest.fn() };
  // Realistic tx: invoke the callback with a fake manager so a throw inside
  // rejects the whole unit of work (lets us exercise rollback + compensation).
  const fakeManager = {} as never;
  const dataSource = {
    transaction: jest.fn((cb: (m: never) => unknown) => cb(fakeManager)),
  };

  const build = () =>
    new AttachmentCommandService(
      registry as never,
      repo as never,
      storage as never,
      memberQuery as never,
      dataSource as never,
    );

  const file: UploadedFileMeta = {
    filename: 'stored-key.png',
    filepath: '/uploads/stored-key.png',
    originalName: 'photo.png',
    fileSize: 1234,
    mimeType: 'image/png',
  };
  const issueCtx: AttachmentContext = {
    target: 'issue',
    projectId: 'p1',
    parentId: 'i1',
    userId: 'u1',
  };

  beforeEach(() => jest.clearAllMocks());

  describe('createForTarget', () => {
    it('guards the parent, uploads, then persists row + history in one tx', async () => {
      storage.upload.mockResolvedValue('stored-key.png');

      const out = await build().createForTarget(issueCtx, file);

      expect(assertParent).toHaveBeenCalledWith(issueCtx);
      expect(storage.upload).toHaveBeenCalledWith(
        file.filepath,
        expect.objectContaining({ filename: 'stored-key.png', size: 1234 }),
      );
      // row written through the tx-enlisted manager, with the resolved FK column
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ issueId: 'i1', filename: 'stored-key.png' }),
        fakeManager,
      );
      expect(repo.appendHistory).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPLOADED', attachmentId: 'a1' }),
        fakeManager,
      );
      expect(out).toMatchObject({ id: 'a1', issueId: 'i1' });
    });

    it('compensates with storage.delete when the tx fails (no orphaned bytes)', async () => {
      storage.upload.mockResolvedValue('stored-key.png');
      repo.appendHistory.mockRejectedValueOnce(new Error('db down'));

      await expect(build().createForTarget(issueCtx, file)).rejects.toThrow(
        'db down',
      );
      // the uploaded file is rolled back out of storage
      expect(storage.delete).toHaveBeenCalledWith('stored-key.png');
    });
  });

  describe('removeForTarget', () => {
    const att = {
      id: 'a1',
      issueId: 'i1',
      uploaderId: 'u1',
      filename: 'stored-key.png',
    } as AttachmentView;

    it('removes row + history in a tx, then deletes the file (commit-then-cleanup)', async () => {
      repo.findOneByTarget.mockResolvedValue(att);
      memberQuery.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);

      await build().removeForTarget(issueCtx, 'a1');

      expect(assertParent).toHaveBeenCalledWith(issueCtx);
      expect(repo.remove).toHaveBeenCalledWith(att, fakeManager);
      expect(repo.appendHistory).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETED', attachmentId: 'a1' }),
        fakeManager,
      );
      expect(storage.delete).toHaveBeenCalledWith('stored-key.png');
    });

    it('deletes the file for a NON-project target (orphan-leak regression guard)', async () => {
      const sprintCtx: AttachmentContext = {
        target: 'sprint',
        projectId: 'p1',
        parentId: 's1',
        userId: 'u1',
      };
      registry.resolve.mockReturnValueOnce({
        column: 'sprintId',
        assertParent,
      });
      repo.findOneByTarget.mockResolvedValue({
        ...att,
        sprintId: 's1',
      });
      memberQuery.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);

      await build().removeForTarget(sprintCtx, 'a1');

      // legacy removeForSprint NEVER unlinked the file — this is the fix.
      expect(storage.delete).toHaveBeenCalledWith('stored-key.png');
    });

    it('checks membership exactly once (fixes the legacy double getUserRole call)', async () => {
      repo.findOneByTarget.mockResolvedValue(att);
      memberQuery.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);

      await build().removeForTarget(issueCtx, 'a1');

      expect(memberQuery.getUserRole).toHaveBeenCalledTimes(1);
    });

    it('forbids a non-uploader who is not a lead', async () => {
      repo.findOneByTarget.mockResolvedValue({ ...att, uploaderId: 'someone' });
      memberQuery.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);

      await expect(
        build().removeForTarget(issueCtx, 'a1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.remove).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('throws NotFound when the attachment is absent', async () => {
      repo.findOneByTarget.mockResolvedValue(null);
      await expect(
        build().removeForTarget(issueCtx, 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

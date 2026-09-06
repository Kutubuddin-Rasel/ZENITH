/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
// src/releases/services/release-command.service.spec.ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReleaseCommandService } from './release-command.service';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { ReleaseStatus } from '../entities/release.entity';
import type {
  IReleaseQuery,
  IReleaseNotes,
  IReleaseRepository,
} from '../interfaces/releases.interfaces';
import type { EntityManager } from 'typeorm';

describe('ReleaseCommandService', () => {
  let repo: jest.Mocked<IReleaseRepository>;
  let query: jest.Mocked<IReleaseQuery>;
  let notes: jest.Mocked<IReleaseNotes>;
  let issues: { findOne: jest.Mock };
  let members: { getUserRole: jest.Mock };
  let audit: { log: jest.Mock };
  let notifications: { notifyWatchersOnEvent: jest.Mock };
  let svc: ReleaseCommandService;

  beforeEach(() => {
    repo = {
      createRelease: jest.fn((d) => d),
      saveRelease: jest.fn(async (r) => ({ id: 'saved', ...r })),
      removeRelease: jest.fn(),
      createLink: jest.fn((releaseId, issueId) => ({ releaseId, issueId })),
      saveLink: jest.fn(async (l) => l),
      findLink: jest.fn(),
      removeLink: jest.fn(),
      insertLinks: jest.fn(),
      createAttachment: jest.fn((d) => d),
      saveAttachment: jest.fn(async (a) => a),
      findAttachment: jest.fn(),
      removeAttachment: jest.fn(),
      // transaction runs the work with a sentinel manager.
      transaction: jest.fn(async (work) =>
        work({ id: 'mgr' } as unknown as EntityManager),
      ),
    } as unknown as jest.Mocked<IReleaseRepository>;
    query = {
      findOne: jest.fn(),
      getIssues: jest.fn(),
    } as unknown as jest.Mocked<IReleaseQuery>;
    notes = { generateReleaseNotes: jest.fn() } as never;
    issues = { findOne: jest.fn() };
    members = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    };
    audit = { log: jest.fn() };
    notifications = { notifyWatchersOnEvent: jest.fn() };

    svc = new ReleaseCommandService(
      repo,
      query,
      notes,
      issues as never,
      members as never,
      audit as never,
      notifications as never,
    );
  });

  describe('create', () => {
    it('requires ProjectLead', async () => {
      members.getUserRole.mockResolvedValue(ProjectRole.MEMBER);
      await expect(
        svc.create('p1', 'u1', { name: 'v1.0.0' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('saves, audits, and notifies', async () => {
      const res = await svc.create('p1', 'u1', { name: 'v1.0.0' } as never);
      expect(res.id).toBe('saved');
      expect(audit.log).toHaveBeenCalled();
      expect(notifications.notifyWatchersOnEvent).toHaveBeenCalled();
    });
  });

  describe('assignIssue', () => {
    it('is idempotent — returns the existing link without re-saving', async () => {
      query.findOne.mockResolvedValue({ id: 'r1' } as never);
      issues.findOne.mockResolvedValue({ id: 'i1' });
      repo.findLink.mockResolvedValue({
        releaseId: 'r1',
        issueId: 'i1',
      } as never);
      await svc.assignIssue('p1', 'r1', 'u1', { issueId: 'i1' } as never);
      expect(repo.saveLink).not.toHaveBeenCalled();
    });
  });

  describe('unassignIssue', () => {
    it('throws NotFound when the link does not exist', async () => {
      query.findOne.mockResolvedValue({ id: 'r1' } as never);
      repo.findLink.mockResolvedValue(null);
      await expect(
        svc.unassignIssue('p1', 'r1', 'u1', { issueId: 'i1' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createRollback (ACID + batch insert)', () => {
    beforeEach(() => {
      query.findOne.mockResolvedValue({ id: 'r0', name: 'v1.2.3' } as never);
      query.getIssues.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }] as never);
    });

    it('wraps the release + links in a single transaction', async () => {
      await svc.createRollback('p1', 'r0', 'u1');
      expect(repo.transaction).toHaveBeenCalledTimes(1);
      // release saved with the transaction manager
      expect(repo.saveRelease).toHaveBeenCalledWith(
        expect.objectContaining({ isRollback: true, rollbackFromId: 'r0' }),
        expect.objectContaining({ id: 'mgr' }),
      );
    });

    it('inserts all issue links in ONE batch (not a per-issue loop)', async () => {
      await svc.createRollback('p1', 'r0', 'u1');
      expect(repo.insertLinks).toHaveBeenCalledTimes(1);
      expect(repo.insertLinks).toHaveBeenCalledWith(
        [
          { releaseId: 'saved', issueId: 'i1' },
          { releaseId: 'saved', issueId: 'i2' },
        ],
        expect.objectContaining({ id: 'mgr' }),
      );
      expect(repo.saveLink).not.toHaveBeenCalled();
    });

    it('does not audit/notify if the transaction throws (no orphan)', async () => {
      repo.transaction.mockRejectedValue(new Error('tx failed'));
      await expect(svc.createRollback('p1', 'r0', 'u1')).rejects.toThrow(
        'tx failed',
      );
      expect(audit.log).not.toHaveBeenCalled();
      expect(notifications.notifyWatchersOnEvent).not.toHaveBeenCalled();
    });

    it('requires ProjectLead', async () => {
      members.getUserRole.mockResolvedValue(ProjectRole.MEMBER);
      await expect(svc.createRollback('p1', 'r0', 'u1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('syncs deprecated isReleased flag and notifies on release transition', async () => {
      query.findOne.mockResolvedValue({
        id: 'r1',
        name: 'v1',
        status: ReleaseStatus.UPCOMING,
      } as never);
      await svc.update('p1', 'r1', 'u1', {
        status: ReleaseStatus.RELEASED,
      } as never);
      expect(repo.saveRelease).toHaveBeenCalledWith(
        expect.objectContaining({ isReleased: true }),
      );
      expect(notifications.notifyWatchersOnEvent).toHaveBeenCalled();
    });
  });
});

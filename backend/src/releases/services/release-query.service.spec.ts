/* eslint-disable @typescript-eslint/unbound-method */
// src/releases/services/release-query.service.spec.ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReleaseQueryService } from './release-query.service';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import type { IReleaseRepository } from '../interfaces/releases.interfaces';

describe('ReleaseQueryService', () => {
  let repo: jest.Mocked<IReleaseRepository>;
  let projectsQuery: { findById: jest.Mock };
  let members: { getUserRole: jest.Mock };
  let svc: ReleaseQueryService;

  beforeEach(() => {
    repo = {
      findReleaseDetail: jest.fn(),
      findAllReleases: jest.fn(),
      findReleasesPaginated: jest.fn(),
      findVersionNames: jest.fn(),
      findLinksByRelease: jest.fn(),
    } as unknown as jest.Mocked<IReleaseRepository>;
    projectsQuery = { findById: jest.fn().mockResolvedValue({ id: 'p1' }) };
    members = { getUserRole: jest.fn().mockResolvedValue(ProjectRole.MEMBER) };
    svc = new ReleaseQueryService(
      repo,
      projectsQuery as never,
      members as never,
    );
  });

  describe('findOne', () => {
    it('returns the release after a membership check', async () => {
      repo.findReleaseDetail.mockResolvedValue({ id: 'r1' } as never);
      await expect(svc.findOne('p1', 'r1', 'u1')).resolves.toEqual({
        id: 'r1',
      });
    });

    it('throws NotFound when the release is absent', async () => {
      repo.findReleaseDetail.mockResolvedValue(null);
      await expect(svc.findOne('p1', 'r1', 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws Forbidden for a non-member', async () => {
      repo.findReleaseDetail.mockResolvedValue({ id: 'r1' } as never);
      members.getUserRole.mockResolvedValue(null);
      await expect(svc.findOne('p1', 'r1', 'u1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('getLatestVersion (O(n) max-scan)', () => {
    it('returns the highest version name via a single projected read', async () => {
      repo.findVersionNames.mockResolvedValue(['v1.0.0', 'v1.2.0', 'v1.1.5']);
      await expect(svc.getLatestVersion('p1', 'u1')).resolves.toBe('v1.2.0');
      expect(repo.findVersionNames).toHaveBeenCalledTimes(1);
    });

    it('returns null when there are no parseable versions', async () => {
      repo.findVersionNames.mockResolvedValue(['nightly']);
      await expect(svc.getLatestVersion('p1', 'u1')).resolves.toBeNull();
    });
  });

  describe('suggestNextVersion (single fetch)', () => {
    it('fetches version names exactly once and bumps patch by default', async () => {
      repo.findVersionNames.mockResolvedValue(['v1.2.0', 'v1.2.3']);
      const res = await svc.suggestNextVersion('p1', 'u1');
      expect(res.current).toBe('v1.2.3');
      expect(res.suggested).toBe('v1.2.4');
      expect(res.allVersions).toEqual(['v1.2.0', 'v1.2.3']);
      // The DSA fix: ONE read feeds both current + allVersions (god class: 2).
      expect(repo.findVersionNames).toHaveBeenCalledTimes(1);
    });

    it('bumps major/minor correctly', async () => {
      repo.findVersionNames.mockResolvedValue(['v1.2.3']);
      await expect(
        svc.suggestNextVersion('p1', 'u1', 'major'),
      ).resolves.toMatchObject({ suggested: 'v2.0.0' });
      await expect(
        svc.suggestNextVersion('p1', 'u1', 'minor'),
      ).resolves.toMatchObject({ suggested: 'v1.3.0' });
    });

    it('suggests v1.0.0 when no versions exist', async () => {
      repo.findVersionNames.mockResolvedValue([]);
      await expect(svc.suggestNextVersion('p1', 'u1')).resolves.toEqual({
        suggested: 'v1.0.0',
        current: null,
        allVersions: [],
      });
    });
  });

  describe('compareReleases (deduped, parallel)', () => {
    it('computes added/removed/common from issue links', async () => {
      repo.findReleaseDetail
        .mockResolvedValueOnce({ id: 'r1', name: 'v1' } as never)
        .mockResolvedValueOnce({ id: 'r2', name: 'v2' } as never);
      repo.findLinksByRelease
        .mockResolvedValueOnce([{ issue: { id: 'i1' } }] as never) // r1
        .mockResolvedValueOnce([
          { issue: { id: 'i1' } },
          { issue: { id: 'i2' } },
        ] as never); // r2

      const res = await svc.compareReleases('p1', 'r1', 'r2', 'u1');
      expect(res.addedIssues.map((i) => i.id)).toEqual(['i2']);
      expect(res.removedIssues).toEqual([]);
      expect(res.commonIssues.map((i) => i.id)).toEqual(['i1']);
      // 2 detail reads + 2 link reads — no extra findOne from getIssues.
      expect(repo.findReleaseDetail).toHaveBeenCalledTimes(2);
      expect(repo.findLinksByRelease).toHaveBeenCalledTimes(2);
    });
  });
});

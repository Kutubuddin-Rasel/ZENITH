import { Test, TestingModule } from '@nestjs/testing';

import { CACHE_STORE_TOKEN } from '../../../cache/constants/cache.tokens';
import { ProjectSecurityPolicyRepository } from '../../../database/repositories/project-security-policy.repository';

import { ProjectSecurityPolicyQueryService } from '../project-security-policy-query.service';

describe('ProjectSecurityPolicyQueryService', () => {
  let service: ProjectSecurityPolicyQueryService;

  const policyRepo = { findByProject: jest.fn() };
  const cacheStore = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

  const fullPolicy = {
    id: 'pol-1',
    projectId: 'p1',
    require2FA: false,
    requirePasswordMinLength: 8,
    requirePasswordComplexity: false,
    passwordMaxAgeDays: 0,
    maxSessionTimeoutMinutes: 480,
    enforceSessionTimeout: false,
    requireIPAllowlist: false,
    blockedCountries: [],
    notifyOnPolicyViolation: true,
    notifyOnAccessDenied: true,
    updatedById: null,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectSecurityPolicyQueryService,
        { provide: ProjectSecurityPolicyRepository, useValue: policyRepo },
        { provide: CACHE_STORE_TOKEN, useValue: cacheStore },
      ],
    }).compile();

    service = module.get(ProjectSecurityPolicyQueryService);
  });

  describe('getPolicy', () => {
    it('returns null when no row exists (cache miss + DB miss)', async () => {
      cacheStore.get.mockResolvedValue(null);
      policyRepo.findByProject.mockResolvedValue(null);

      await expect(service.getPolicy('p1')).resolves.toBeNull();
      expect(cacheStore.set).not.toHaveBeenCalled();
    });

    it('hydrates ISO date strings from cache back into Date instances', async () => {
      cacheStore.get.mockResolvedValue({
        ...fullPolicy,
        createdAt: fullPolicy.createdAt.toISOString(),
        updatedAt: fullPolicy.updatedAt.toISOString(),
      });

      const view = await service.getPolicy('p1');

      expect(view?.createdAt).toBeInstanceOf(Date);
      expect(view?.updatedAt).toBeInstanceOf(Date);
      expect(policyRepo.findByProject).not.toHaveBeenCalled();
    });

    it('reads through DB on miss and writes a 30s-TTL cache entry', async () => {
      cacheStore.get.mockResolvedValue(null);
      policyRepo.findByProject.mockResolvedValue(fullPolicy);

      const view = await service.getPolicy('p1');

      expect(view?.id).toBe('pol-1');
      expect(cacheStore.set).toHaveBeenCalledWith(
        'project:p1:security-policy',
        expect.objectContaining({
          createdAt: fullPolicy.createdAt.toISOString(),
        }),
        { ttl: 30 },
      );
    });
  });

  describe('hasActiveRequirements', () => {
    it('returns false when policy is null', async () => {
      cacheStore.get.mockResolvedValue(null);
      policyRepo.findByProject.mockResolvedValue(null);

      await expect(service.hasActiveRequirements('p1')).resolves.toBe(false);
    });

    it('returns false when every requirement flag is off', async () => {
      cacheStore.get.mockResolvedValue(null);
      policyRepo.findByProject.mockResolvedValue(fullPolicy);

      await expect(service.hasActiveRequirements('p1')).resolves.toBe(false);
    });

    it('returns true when require2FA is enabled', async () => {
      cacheStore.get.mockResolvedValue(null);
      policyRepo.findByProject.mockResolvedValue({
        ...fullPolicy,
        require2FA: true,
      });

      await expect(service.hasActiveRequirements('p1')).resolves.toBe(true);
    });

    it('returns true when blockedCountries is non-empty', async () => {
      cacheStore.get.mockResolvedValue(null);
      policyRepo.findByProject.mockResolvedValue({
        ...fullPolicy,
        blockedCountries: ['KP'],
      });

      await expect(service.hasActiveRequirements('p1')).resolves.toBe(true);
    });

    it('returns true when requireIPAllowlist is on', async () => {
      cacheStore.get.mockResolvedValue(null);
      policyRepo.findByProject.mockResolvedValue({
        ...fullPolicy,
        requireIPAllowlist: true,
      });

      await expect(service.hasActiveRequirements('p1')).resolves.toBe(true);
    });
  });
});

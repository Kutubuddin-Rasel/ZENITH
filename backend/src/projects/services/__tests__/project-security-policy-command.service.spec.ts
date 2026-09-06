/* eslint-disable @typescript-eslint/require-await */
import { Test, TestingModule } from '@nestjs/testing';

import { CACHE_STORE_TOKEN } from '../../../cache/constants/cache.tokens';
import { ProjectSecurityPolicyRepository } from '../../../database/repositories/project-security-policy.repository';

import { ProjectSecurityPolicyCommandService } from '../project-security-policy-command.service';

describe('ProjectSecurityPolicyCommandService', () => {
  let service: ProjectSecurityPolicyCommandService;

  const policyRepo = {
    findByProject: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const cacheStore = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectSecurityPolicyCommandService,
        { provide: ProjectSecurityPolicyRepository, useValue: policyRepo },
        { provide: CACHE_STORE_TOKEN, useValue: cacheStore },
      ],
    }).compile();

    service = module.get(ProjectSecurityPolicyCommandService);
  });

  describe('getOrCreate', () => {
    it('returns the existing row when present', async () => {
      const existing = { id: 'p-existing', projectId: 'p1' };
      policyRepo.findByProject.mockResolvedValue(existing);

      const result = await service.getOrCreate('p1');

      expect(result).toBe(existing);
      expect(policyRepo.create).not.toHaveBeenCalled();
      expect(policyRepo.save).not.toHaveBeenCalled();
    });

    it('persists defaults when no row exists (passwordMinLength=8, sessionTimeout=480)', async () => {
      policyRepo.findByProject.mockResolvedValue(null);
      const draft = { id: 'p-new', projectId: 'p1' };
      policyRepo.create.mockReturnValue(draft);
      policyRepo.save.mockResolvedValue(draft);

      const result = await service.getOrCreate('p1');

      expect(policyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'p1',
          require2FA: false,
          requirePasswordMinLength: 8,
          maxSessionTimeoutMinutes: 480,
          notifyOnPolicyViolation: true,
        }),
      );
      expect(result).toBe(draft);
    });
  });

  describe('update', () => {
    it('applies patch, stamps updatedById, invalidates cache', async () => {
      const existing = {
        id: 'p1-policy',
        projectId: 'p1',
        require2FA: false,
        updatedById: null,
      };
      policyRepo.findByProject.mockResolvedValue(existing);
      policyRepo.save.mockImplementation(async (e: typeof existing) => e);

      const result = await service.update('p1', 'user-1', {
        require2FA: true,
      });

      expect(result.require2FA).toBe(true);
      expect(result.updatedById).toBe('user-1');
      expect(cacheStore.del).toHaveBeenCalledWith('project:p1:security-policy');
    });

    it('lazy-creates a row before applying patch when none exists', async () => {
      policyRepo.findByProject.mockResolvedValue(null);
      const draft = {
        id: 'p-new',
        projectId: 'p1',
        require2FA: false,
        updatedById: null,
      };
      policyRepo.create.mockReturnValue(draft);
      policyRepo.save.mockImplementation(async (e: typeof draft) => e);

      const result = await service.update('p1', 'user-1', {
        requireIPAllowlist: true,
      });

      expect(policyRepo.create).toHaveBeenCalled();
      expect(result.updatedById).toBe('user-1');
    });
  });
});

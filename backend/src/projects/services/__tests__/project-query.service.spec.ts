import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import {
  CACHE_STORE_TOKEN,
  ENTITY_CACHE_TOKEN,
} from '../../../cache/constants/cache.tokens';
import { ProjectRepository } from '../../../database/repositories/project.repository';
import {
  TENANT_CONTEXT_READER_TOKEN,
  TenantRepositoryFactory,
} from '../../../core/tenant';

import { Project } from '../../entities/project.entity';
import { ProjectQueryService } from '../project-query.service';

describe('ProjectQueryService', () => {
  let service: ProjectQueryService;

  const projectRepo = { find: jest.fn(), findOne: jest.fn() };
  const projects = {
    findById: jest.fn(),
    findByKey: jest.fn(),
    findForMember: jest.fn(),
  };
  const entityCache = {
    getCachedProject: jest.fn(),
    cacheProject: jest.fn(),
    invalidateProjectCache: jest.fn(),
  };
  const cacheStore = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const tenantContext = { getTenantId: jest.fn() };
  const tenantWrapper = { findOne: jest.fn(), find: jest.fn() };
  const tenantRepoFactory = { create: jest.fn(() => tenantWrapper) };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectQueryService,
        { provide: getRepositoryToken(Project), useValue: projectRepo },
        { provide: ProjectRepository, useValue: projects },
        { provide: ENTITY_CACHE_TOKEN, useValue: entityCache },
        { provide: CACHE_STORE_TOKEN, useValue: cacheStore },
        { provide: TenantRepositoryFactory, useValue: tenantRepoFactory },
        { provide: TENANT_CONTEXT_READER_TOKEN, useValue: tenantContext },
      ],
    }).compile();

    service = module.get(ProjectQueryService);
    service.onModuleInit();
  });

  describe('findById', () => {
    it('returns the cached projection when entity cache hits and tenant matches', async () => {
      tenantContext.getTenantId.mockReturnValue('org-1');
      entityCache.getCachedProject.mockResolvedValue({
        id: 'p1',
        name: 'Alpha',
        key: 'ALP',
        description: null,
        templateId: null,
        isArchived: false,
        organizationId: 'org-1',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      });

      const summary = await service.findById('p1');

      expect(summary.id).toBe('p1');
      expect(summary.createdAt).toBeInstanceOf(Date);
      expect(tenantWrapper.findOne).not.toHaveBeenCalled();
    });

    it('rejects a cache hit whose organizationId differs from the active tenant', async () => {
      tenantContext.getTenantId.mockReturnValue('org-1');
      entityCache.getCachedProject.mockResolvedValue({
        id: 'p1',
        name: 'Alpha',
        key: 'ALP',
        organizationId: 'org-2',
      });

      await expect(service.findById('p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('falls through tenant wrapper on cache miss and back-populates the cache', async () => {
      tenantContext.getTenantId.mockReturnValue('org-1');
      entityCache.getCachedProject.mockResolvedValue(null);
      tenantWrapper.findOne.mockResolvedValue({
        id: 'p1',
        name: 'Alpha',
        key: 'ALP',
        description: null,
        templateId: null,
        isArchived: false,
        organizationId: 'org-1',
        createdAt: new Date('2026-05-01'),
        updatedAt: new Date('2026-05-01'),
      });

      const summary = await service.findById('p1');

      expect(summary.id).toBe('p1');
      expect(entityCache.cacheProject).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ id: 'p1' }),
      );
    });

    it('throws NotFoundException when the row does not exist', async () => {
      entityCache.getCachedProject.mockResolvedValue(null);
      tenantWrapper.findOne.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findByKey', () => {
    it('returns null on miss (uniqueness check contract)', async () => {
      tenantWrapper.findOne.mockResolvedValue(null);
      await expect(service.findByKey('NEW')).resolves.toBeNull();
    });

    it('returns a summary on hit', async () => {
      tenantWrapper.findOne.mockResolvedValue({
        id: 'p1',
        name: 'Alpha',
        key: 'ALP',
        isArchived: false,
        organizationId: 'org-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.findByKey('ALP');
      expect(result?.key).toBe('ALP');
    });
  });

  describe('findForUser', () => {
    it('returns empty list when no tenant is in context', async () => {
      tenantContext.getTenantId.mockReturnValue(undefined);
      const result = await service.findForUser('u1', false);
      expect(result).toEqual([]);
    });

    it('bypasses membership filter for super-admin within a tenant', async () => {
      tenantContext.getTenantId.mockReturnValue('org-1');
      tenantWrapper.find.mockResolvedValue([
        {
          id: 'p1',
          name: 'A',
          key: 'A',
          isArchived: false,
          organizationId: 'org-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.findForUser('u1', true);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBeNull();
    });

    it('returns membership-scoped projects for non-admin', async () => {
      tenantContext.getTenantId.mockReturnValue('org-1');
      projects.findForMember.mockResolvedValue([
        {
          id: 'p1',
          name: 'A',
          key: 'A',
          isArchived: false,
          organizationId: 'org-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.findForUser('u1', false);
      expect(projects.findForMember).toHaveBeenCalledWith('u1', 'org-1');
      expect(result).toHaveLength(1);
    });
  });
});

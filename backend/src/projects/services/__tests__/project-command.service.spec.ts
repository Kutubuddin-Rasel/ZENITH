/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { ENTITY_CACHE_TOKEN } from '../../../cache/constants/cache.tokens';
import { ProjectRepository } from '../../../database/repositories/project.repository';
import { TENANT_CONTEXT_READER_TOKEN } from '../../../core/tenant';
import { PROJECT_MEMBER_COMMAND_TOKEN } from '../../../membership/constants/membership.tokens';
import { ProjectRole } from '../../../membership/enums/project-role.enum';

import {
  AUDIT_LOG_WRITER_TOKEN,
  PROJECT_QUERY_TOKEN,
} from '../../constants/projects.tokens';
import { TemplateApplicationPort } from '../../ports/template-application.port';
import { ProjectCommandService } from '../project-command.service';

describe('ProjectCommandService', () => {
  let service: ProjectCommandService;

  const projects = {
    findById: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const projectQuery = { findById: jest.fn() };
  const membersCommand = { addMember: jest.fn() };
  const entityCache = {
    invalidateProjectCache: jest.fn(),
    cacheProject: jest.fn(),
    getCachedProject: jest.fn(),
  };
  const auditWriter = { log: jest.fn() };
  const cls = { get: jest.fn() };
  const tenantContext = { getTenantId: jest.fn(() => 'org-1') };
  const templateApp = { applyTemplate: jest.fn() };

  // ----- DataSource.transaction harness -------------------------------------
  // The transaction mock invokes the callback with a stub `EntityManager`.
  // The stub's `save` returns whatever entity was passed in (plus a synthetic
  // id) so the create() flow can proceed to the membersCommand.addMember and
  // optional templateApp.applyTemplate steps.
  const managerStub = {
    create: jest.fn((_entity: unknown, draft: unknown) => draft),
    save: jest.fn(async (_entity: unknown, draft: unknown) => ({
      ...(draft as Record<string, unknown>),
      id: 'p-new',
      isArchived: false,
      createdAt: new Date('2026-05-01'),
      updatedAt: new Date('2026-05-01'),
    })),
  } as unknown as EntityManager;

  const dataSource = {
    transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
      cb(managerStub),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Restore default success behaviour after rollback tests reassign it.
    dataSource.transaction.mockImplementation(
      async (cb: (m: EntityManager) => Promise<unknown>) => cb(managerStub),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectCommandService,
        { provide: ProjectRepository, useValue: projects },
        { provide: PROJECT_QUERY_TOKEN, useValue: projectQuery },
        { provide: PROJECT_MEMBER_COMMAND_TOKEN, useValue: membersCommand },
        { provide: ENTITY_CACHE_TOKEN, useValue: entityCache },
        { provide: AUDIT_LOG_WRITER_TOKEN, useValue: auditWriter },
        { provide: DataSource, useValue: dataSource },
        { provide: ClsService, useValue: cls },
        { provide: TENANT_CONTEXT_READER_TOKEN, useValue: tenantContext },
        { provide: TemplateApplicationPort, useValue: templateApp },
      ],
    }).compile();

    service = module.get(ProjectCommandService);
  });

  describe('create — happy path', () => {
    it('persists project, assigns lead, applies template, and audits', async () => {
      const result = await service.create({
        actorUserId: 'lead-1',
        name: 'Alpha',
        key: 'ALP',
        templateId: 'tpl-1',
      });

      expect(result.id).toBe('p-new');
      expect(membersCommand.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'p-new',
          userId: 'lead-1',
          roleName: ProjectRole.PROJECT_LEAD,
        }),
        managerStub,
      );
      expect(templateApp.applyTemplate).toHaveBeenCalledWith(
        'p-new',
        'tpl-1',
        'lead-1',
        managerStub,
      );
      expect(auditWriter.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PROJECT_CREATED' }),
      );
    });

    it('adds creator as a regular MEMBER when leadUserId differs', async () => {
      await service.create({
        actorUserId: 'creator-1',
        leadUserId: 'lead-1',
        name: 'Beta',
        key: 'BTA',
      });

      // First call: lead-1 as PROJECT_LEAD; second call: creator-1 as MEMBER.
      expect(membersCommand.addMember).toHaveBeenCalledTimes(2);
      expect(membersCommand.addMember).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          userId: 'creator-1',
          roleName: ProjectRole.MEMBER,
        }),
        managerStub,
      );
    });

    it('skips template application when templateId is omitted', async () => {
      await service.create({
        actorUserId: 'lead-1',
        name: 'Gamma',
        key: 'GMA',
      });

      expect(templateApp.applyTemplate).not.toHaveBeenCalled();
    });
  });

  describe('create — transactional rollback semantics', () => {
    it('does NOT audit when addMember throws inside the transaction', async () => {
      // Simulate Postgres-style throw inside the closure: the transaction
      // wrapper must propagate the error and the audit log must NOT fire.
      dataSource.transaction.mockImplementation(
        async (cb: (m: EntityManager) => Promise<unknown>) => {
          membersCommand.addMember.mockRejectedValueOnce(
            new Error('membership-failed'),
          );
          return cb(managerStub);
        },
      );

      await expect(
        service.create({
          actorUserId: 'lead-1',
          name: 'Delta',
          key: 'DLT',
        }),
      ).rejects.toThrow('membership-failed');

      expect(auditWriter.log).not.toHaveBeenCalled();
    });

    it('translates 23505 unique-violation into BadRequestException', async () => {
      dataSource.transaction.mockRejectedValueOnce({
        code: '23505',
        driverError: { code: '23505' },
      });

      await expect(
        service.create({
          actorUserId: 'lead-1',
          name: 'Epsilon',
          key: 'EPS',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does NOT audit when template application throws', async () => {
      templateApp.applyTemplate.mockRejectedValueOnce(
        new Error('template-broken'),
      );

      await expect(
        service.create({
          actorUserId: 'lead-1',
          name: 'Zeta',
          key: 'ZTA',
          templateId: 'tpl-bad',
        }),
      ).rejects.toThrow('template-broken');

      expect(auditWriter.log).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the project is missing', async () => {
      projectQuery.findById.mockResolvedValue({
        id: 'p1',
        organizationId: 'org-1',
      });
      projects.findById.mockResolvedValue(null);

      await expect(
        service.update('p1', { name: 'New' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applies patch, invalidates cache, and audits with field list', async () => {
      projectQuery.findById.mockResolvedValue({
        id: 'p1',
        organizationId: 'org-1',
      });
      const entity = {
        id: 'p1',
        name: 'Old',
        description: 'd',
        isArchived: false,
      };
      projects.findById.mockResolvedValue(entity);
      projects.save.mockResolvedValue({ ...entity, name: 'New' });

      await service.update('p1', { name: 'New' });

      expect(entityCache.invalidateProjectCache).toHaveBeenCalledWith('p1');
      expect(auditWriter.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_UPDATED',
          metadata: expect.objectContaining({
            fieldsChanged: ['name'],
          }),
        }),
      );
    });
  });

  describe('archive', () => {
    it('sets isArchived and invalidates cache', async () => {
      const entity = { id: 'p1', isArchived: false };
      projects.findById.mockResolvedValue(entity);
      projects.save.mockImplementation(async (e: { isArchived: boolean }) => e);

      const result = await service.archive('p1');

      expect(result.isArchived).toBe(true);
      expect(entityCache.invalidateProjectCache).toHaveBeenCalledWith('p1');
    });
  });

  describe('remove', () => {
    it('removes the entity and audits with HIGH severity', async () => {
      projectQuery.findById.mockResolvedValue({
        id: 'p1',
        name: 'Doomed',
        organizationId: 'org-1',
      });
      projects.findById.mockResolvedValue({ id: 'p1' });

      await service.remove('p1');

      expect(projects.remove).toHaveBeenCalled();
      expect(auditWriter.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_DELETED',
          severity: 'HIGH',
        }),
      );
    });
  });
});

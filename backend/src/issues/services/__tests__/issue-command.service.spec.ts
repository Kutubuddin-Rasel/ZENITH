import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { IssueCommandService } from '../issue-command.service';
import { IssueQueryService } from '../issue-query.service';
import { IssueKeyService } from '../issue-key.service';
import { IssueAuthzService } from '../issue-authz.service';
import { IssueRepository } from '../../../database/repositories/issue.repository';
import {
  CACHE_INVALIDATOR_TOKEN,
  CACHE_STORE_TOKEN,
} from '../../../cache/constants/cache.tokens';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../../membership/constants/membership.tokens';
import { ISSUE_EVENT_FACTORY_TOKEN } from '../../../common/constants/events.tokens';
import { AuditPort } from '../../ports/audit.port';
import { IssueBroadcastPort } from '../../ports/issue-broadcast.port';
import { WorkflowStatusLookupPort } from '../../ports/workflow-lookup.port';
import { CreateIssueDto } from '../../dto/create-issue.dto';

/**
 * IssueCommandService — guard regression suite (ported from the deleted
 * god-class spec, Step 4).
 *
 * Focuses on the Step-3 correctness fixes: a missing project on `create`
 * must surface as `NotFoundException` (not `BadRequestException`), and a
 * non-member assignee is rejected before any write. The full happy-path
 * persistence chain is exercised end-to-end via the controller + consumer
 * specs; the ACID/after-commit discipline is covered by
 * `issue-transition.service.spec.ts`.
 */
describe('IssueCommandService', () => {
  let service: IssueCommandService;

  const mockIssueRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockQuery = { findOne: jest.fn() };
  const mockKeyService = {
    findTenantProject: jest.fn(),
    enrichWithKey: jest.fn(),
  };
  const mockAuthz = { requireLeadOrSuperAdmin: jest.fn() };
  const mockMembers = { getUserRole: jest.fn() };
  const mockStatusLookup = {
    findById: jest.fn(),
    getDefaultStatus: jest.fn(),
    findByProjectAndName: jest.fn(),
  };
  const mockEventEmitter = { emit: jest.fn() };
  const mockEventFactory = { create: jest.fn() };
  const mockAudit = { log: jest.fn() };
  const mockBroadcast = { broadcastToProjectBoards: jest.fn() };
  const mockCache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const mockCacheInvalidator = { invalidateByTags: jest.fn() };
  const mockDataSource = { transaction: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueCommandService,
        { provide: IssueRepository, useValue: mockIssueRepo },
        { provide: IssueQueryService, useValue: mockQuery },
        { provide: IssueKeyService, useValue: mockKeyService },
        { provide: IssueAuthzService, useValue: mockAuthz },
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: mockMembers },
        { provide: WorkflowStatusLookupPort, useValue: mockStatusLookup },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ISSUE_EVENT_FACTORY_TOKEN, useValue: mockEventFactory },
        { provide: AuditPort, useValue: mockAudit },
        { provide: IssueBroadcastPort, useValue: mockBroadcast },
        { provide: CACHE_STORE_TOKEN, useValue: mockCache },
        { provide: CACHE_INVALIDATOR_TOKEN, useValue: mockCacheInvalidator },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(IssueCommandService);
  });

  describe('create — tenant + assignee guards', () => {
    const dto = { title: 'T' } as CreateIssueDto;

    it('throws NotFoundException (not BadRequest) when the project is out of tenant', async () => {
      mockKeyService.findTenantProject.mockResolvedValue(null);

      await expect(
        service.create('proj-1', 'user-1', dto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockIssueRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a non-member assignee with BadRequestException before any write', async () => {
      mockKeyService.findTenantProject.mockResolvedValue({
        id: 'proj-1',
        organizationId: 'org-1',
        key: 'PROJ',
      });
      mockMembers.getUserRole.mockResolvedValue(null);

      await expect(
        service.create('proj-1', 'user-1', {
          ...dto,
          assigneeId: 'ghost',
        } as CreateIssueDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockIssueRepo.save).not.toHaveBeenCalled();
    });
  });
});

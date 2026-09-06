import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { IssueLinkService } from '../issue-link.service';
import { IssueQueryService } from '../issue-query.service';
import { IssueRepository } from '../../../database/repositories/issue.repository';
import { IssueLinkRepository } from '../../../database/repositories/issue-link.repository';
import { LinkType } from '../../entities/issue-link.entity';

/**
 * IssueLinkService — link sub-aggregate regression suite (ported from the
 * deleted god-class spec, Step 4).
 *
 * Access on every mutation flows through `IssueQueryService.findOne`
 * (tenant + membership guard on the SOURCE issue); the self-link,
 * target-existence, and duplicate guards are asserted here.
 */
describe('IssueLinkService', () => {
  let service: IssueLinkService;

  const mockQuery = { findOne: jest.fn() };
  const mockIssueRepo = { findOne: jest.fn() };
  const mockLinkRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Source-issue access check passes by default.
    mockQuery.findOne.mockResolvedValue({ id: 'src' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueLinkService,
        { provide: IssueQueryService, useValue: mockQuery },
        { provide: IssueRepository, useValue: mockIssueRepo },
        { provide: IssueLinkRepository, useValue: mockLinkRepo },
      ],
    }).compile();

    service = module.get(IssueLinkService);
  });

  describe('addLink', () => {
    it('throws NotFoundException when the target issue is absent', async () => {
      mockIssueRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addLink('proj-1', 'src', 'tgt', LinkType.BLOCKS, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a self-referential link', async () => {
      mockIssueRepo.findOne.mockResolvedValue({ id: 'src' });

      await expect(
        service.addLink('proj-1', 'src', 'src', LinkType.BLOCKS, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a duplicate link', async () => {
      mockIssueRepo.findOne.mockResolvedValue({ id: 'tgt' });
      mockLinkRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.addLink('proj-1', 'src', 'tgt', LinkType.BLOCKS, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates and persists a new link after the source access check', async () => {
      mockIssueRepo.findOne.mockResolvedValue({ id: 'tgt' });
      mockLinkRepo.findOne.mockResolvedValue(null);
      const created = { sourceIssueId: 'src', targetIssueId: 'tgt' };
      mockLinkRepo.create.mockReturnValue(created);
      mockLinkRepo.save.mockResolvedValue({ id: 'link-1', ...created });

      const result = await service.addLink(
        'proj-1',
        'src',
        'tgt',
        LinkType.BLOCKS,
        'user-1',
      );

      expect(mockQuery.findOne).toHaveBeenCalledWith('proj-1', 'src', 'user-1');
      expect(mockLinkRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual({ id: 'link-1', ...created });
    });
  });

  describe('removeLink', () => {
    it('throws NotFoundException when the link is absent', async () => {
      mockLinkRepo.findOne.mockResolvedValue(null);

      await expect(
        service.removeLink('proj-1', 'link-1', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockLinkRepo.remove).not.toHaveBeenCalled();
    });

    it('checks source-issue access then removes the link', async () => {
      const link = { id: 'link-1', sourceIssueId: 'src' };
      mockLinkRepo.findOne.mockResolvedValue(link);

      await service.removeLink('proj-1', 'link-1', 'user-1');

      expect(mockQuery.findOne).toHaveBeenCalledWith('proj-1', 'src', 'user-1');
      expect(mockLinkRepo.remove).toHaveBeenCalledWith(link);
    });
  });
});

/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PROJECT_MEMBER_QUERY_TOKEN } from '../../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../../membership/enums/project-role.enum';

import { BoardAuthzService } from '../board-authz.service';

/**
 * BoardAuthzService — focused unit suite.
 *
 * The legacy `BoardsService` spec exercises the 8 duplicated role
 * patterns indirectly through `addColumn`/`updateColumn`/etc. These
 * tests pin the helper's contract directly so the per-method error
 * strings remain stable across the upcoming commits — every command
 * service in Step 3 delegates to this helper, so a regression here
 * would silently change every consumer's HTTP error payload.
 */
describe('BoardAuthzService', () => {
  let service: BoardAuthzService;
  let members: jest.Mocked<IProjectMemberQuery>;

  beforeEach(async () => {
    members = {
      getUserRole: jest.fn(),
    } as unknown as jest.Mocked<IProjectMemberQuery>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardAuthzService,
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: members },
      ],
    }).compile();

    service = module.get(BoardAuthzService);
  });

  describe('requireMember', () => {
    it('resolves when the user has ANY project role', async () => {
      members.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);
      await expect(
        service.requireMember('proj-1', 'user-1'),
      ).resolves.toBeUndefined();
      expect(members.getUserRole).toHaveBeenCalledWith('proj-1', 'user-1');
    });

    it('throws ForbiddenException("Not a project member") when role is null', async () => {
      members.getUserRole.mockResolvedValue(null);
      await expect(service.requireMember('proj-1', 'user-1')).rejects.toThrow(
        new ForbiddenException('Not a project member'),
      );
    });
  });

  describe('requireLead', () => {
    it('resolves when the user is PROJECT_LEAD', async () => {
      members.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);
      await expect(
        service.requireLead('proj-1', 'user-1', 'create boards'),
      ).resolves.toBeUndefined();
    });

    it('throws with the supplied action verb when role is not lead', async () => {
      members.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);
      await expect(
        service.requireLead('proj-1', 'user-1', 'reorder columns'),
      ).rejects.toThrow(
        new ForbiddenException('Only ProjectLead can reorder columns'),
      );
    });

    it('throws when role is null (non-member is also non-lead)', async () => {
      members.getUserRole.mockResolvedValue(null);
      await expect(
        service.requireLead('proj-1', 'user-1', 'delete boards'),
      ).rejects.toThrow(
        new ForbiddenException('Only ProjectLead can delete boards'),
      );
    });
  });
});

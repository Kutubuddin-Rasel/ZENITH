import { Test, TestingModule } from '@nestjs/testing';
import { InvitesService } from './invites.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Invite } from './entities/invite.entity';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '../membership/enums/project-role.enum';

describe('InvitesService', () => {
  let service: InvitesService;
  let inviteRepo: any;
  let projectsService: any;
  let usersService: any;
  let membersService: any;
  let eventEmitter: any;

  const mockInvite = {
    id: 'invite-123',
    token: 'valid-token',
    projectId: 'project-123',
    inviteeId: 'user-456',
    inviterId: 'user-123',
    role: 'Developer',
    status: 'Pending',
    createdAt: new Date(),
    expiresAt: null,
  };

  const mockUser = {
    id: 'user-456',
    email: 'invitee@example.com',
    name: 'Invitee',
  };

  const mockProject = {
    id: 'project-123',
    name: 'Zenith',
  };

  beforeEach(async () => {
    const mockInviteRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const mockProjectsService = {
      findOneById: jest.fn().mockResolvedValue(mockProject),
    };

    const mockUsersService = {
      findOneByEmail: jest.fn(),
      findOneById: jest.fn(),
    };

    const mockMembersService = {
      addMemberToProject: jest.fn(),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        {
          provide: getRepositoryToken(Invite),
          useValue: mockInviteRepo,
        },
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: ProjectMembersService, useValue: mockMembersService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<InvitesService>(InvitesService);
    inviteRepo = module.get(getRepositoryToken(Invite));
    projectsService = module.get(ProjectsService);
    usersService = module.get(UsersService);
    membersService = module.get(ProjectMembersService);
    eventEmitter = module.get(EventEmitter2);
  });

  const getMockInvite = () => ({
    id: 'invite-123',
    token: 'valid-token',
    projectId: 'project-123',
    inviteeId: 'user-456',
    inviterId: 'user-123',
    role: 'Developer',
    status: 'Pending',
    createdAt: new Date(),
    expiresAt: null,
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInvite', () => {
    it('should create invite by email', async () => {
      usersService.findOneByEmail.mockResolvedValue(mockUser);
      inviteRepo.findOne.mockResolvedValue(null); // No existing invite
      inviteRepo.create.mockImplementation((dto) => dto);
      inviteRepo.save.mockImplementation((invite) => ({ ...invite, id: '1' }));

      const result = await service.createInvite({
        projectId: 'project-123',
        email: 'invitee@example.com',
        inviterId: 'user-123',
        role: 'Developer',
      });

      expect(result).toBeDefined();
      expect(inviteRepo.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'invite.created',
        expect.any(Object),
      );
    });

    it('should throw BadRequestException if user not found by email', async () => {
      usersService.findOneByEmail.mockResolvedValue(null);

      await expect(
        service.createInvite({
          projectId: 'p1',
          email: 'unknown@example.com',
          inviterId: 'u1',
          role: 'Dev',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if invite already exists', async () => {
      usersService.findOneByEmail.mockResolvedValue(mockUser);
      inviteRepo.findOne.mockResolvedValue(getMockInvite());

      await expect(
        service.createInvite({
          projectId: 'project-123',
          email: 'invitee@example.com',
          inviterId: 'user-123',
          role: 'Developer',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('respondToInvite', () => {
    it('should accept invite and add member', async () => {
      inviteRepo.findOne.mockResolvedValue(getMockInvite());
      usersService.findOneById.mockResolvedValue(mockUser);

      await service.respondToInvite('invite-123', 'user-456', true);

      expect(inviteRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Accepted' }),
      );
      expect(membersService.addMemberToProject).toHaveBeenCalledWith({
        projectId: 'project-123',
        userId: 'user-456',
        roleName: 'Developer',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'invite.responded',
        expect.objectContaining({ accept: true }),
      );
    });

    it('should reject invite', async () => {
      inviteRepo.findOne.mockResolvedValue(getMockInvite());
      usersService.findOneById.mockResolvedValue(mockUser);

      await service.respondToInvite('invite-123', 'user-456', false, 'reason');

      expect(inviteRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Rejected' }),
      );
      expect(membersService.addMemberToProject).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if userId does not match', async () => {
      inviteRepo.findOne.mockResolvedValue(getMockInvite());

      await expect(
        service.respondToInvite('invite-123', 'wrong-user', true),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revokeInvite', () => {
    it('should revoke pending invite', async () => {
      inviteRepo.findOne.mockResolvedValue(getMockInvite());

      await service.revokeInvite('invite-123', 'user-123'); // same inviter

      expect(inviteRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Revoked' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'invite.revoked',
        expect.any(Object),
      );
    });

    it('should throw ForbiddenException if not inviter', async () => {
      inviteRepo.findOne.mockResolvedValue(getMockInvite());

      await expect(
        service.revokeInvite('invite-123', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resendInvite', () => {
    it('should emit resend event', async () => {
      inviteRepo.findOne.mockResolvedValue(getMockInvite());

      await service.resendInvite('invite-123', 'user-123');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'invite.resend',
        expect.any(Object),
      );
    });
  });
});

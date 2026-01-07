import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsService } from './organizations.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationInvitation, InvitationStatus } from './entities/organization-invitation.entity';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('OrganizationsService', () => {
    let service: OrganizationsService;
    let orgRepo: any;
    let inviteRepo: any;
    let usersService: any;
    let emailService: any;

    const mockOrg = {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
    };

    const mockInvite = {
        id: 'invite-1',
        organizationId: 'org-1',
        email: 'test@example.com',
        token: 'valid-token',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000), // +1 day
    };

    beforeEach(async () => {
        const mockOrgRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
        };

        const mockInviteRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
            find: jest.fn(),
        };

        const mockUsersService = {
            findOneByEmail: jest.fn(),
            findOneById: jest.fn(),
            update: jest.fn(),
        };

        const mockEmailService = {
            sendInvitationEmail: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OrganizationsService,
                { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
                { provide: getRepositoryToken(OrganizationInvitation), useValue: mockInviteRepo },
                { provide: UsersService, useValue: mockUsersService },
                { provide: EmailService, useValue: mockEmailService },
            ],
        }).compile();

        service = module.get<OrganizationsService>(OrganizationsService);
        orgRepo = module.get(getRepositoryToken(Organization));
        inviteRepo = module.get(getRepositoryToken(OrganizationInvitation));
        usersService = module.get(UsersService);
        emailService = module.get(EmailService);
    });

    describe('create', () => {
        it('should create organization with slug', async () => {
            orgRepo.findOne.mockResolvedValue(null); // No existing slug
            orgRepo.create.mockReturnValue(mockOrg);
            orgRepo.save.mockResolvedValue(mockOrg);

            const result = await service.create({ name: 'Test Org' });

            expect(result).toEqual(mockOrg);
            expect(orgRepo.create).toHaveBeenCalledWith({
                name: 'Test Org',
                slug: 'test-org',
            });
        });

        it('should throw conflict if slug exists', async () => {
            orgRepo.findOne.mockResolvedValue(mockOrg);

            await expect(service.create({ name: 'Test Org' })).rejects.toThrow(ConflictException);
        });
    });

    describe('inviteUser', () => {
        it('should create invite and send email', async () => {
            usersService.findOneByEmail.mockResolvedValue(null); // User not in org
            inviteRepo.findOne.mockResolvedValue(null); // No pending invite
            inviteRepo.create.mockReturnValue(mockInvite);
            inviteRepo.save.mockResolvedValue(mockInvite);
            orgRepo.findOne.mockResolvedValue(mockOrg);
            usersService.findOneById.mockResolvedValue({ id: 'inviter-1', name: 'Inviter' });

            const result = await service.inviteUser('org-1', 'test@example.com', 'Member', 'inviter-1');

            expect(result.token).toBeDefined();
            expect(emailService.sendInvitationEmail).toHaveBeenCalled();
        });

        it('should throw conflict if user already in org', async () => {
            usersService.findOneByEmail.mockResolvedValue({ id: 'u1', organizationId: 'org-1' });

            await expect(service.inviteUser('org-1', 'test@example.com', 'Member', 'inviter-1'))
                .rejects.toThrow(ConflictException);
        });
    });

    describe('validateInvite', () => {
        it('should return invite if valid', async () => {
            inviteRepo.findOne.mockResolvedValue(mockInvite);
            const result = await service.validateInvite('valid-token');
            expect(result).toEqual(mockInvite);
        });

        it('should throw if expired', async () => {
            const expiredInvite = { ...mockInvite, expiresAt: new Date(Date.now() - 1000) };
            inviteRepo.findOne.mockResolvedValue(expiredInvite);

            await expect(service.validateInvite('valid-token')).rejects.toThrow(BadRequestException);
            expect(inviteRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: InvitationStatus.EXPIRED }));
        });
    });
});

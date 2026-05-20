/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AuditLogsService } from '../audit/audit-logs.service';
import { UserRepository } from '../database/repositories/user.repository';
import { USER_DELETED_EVENT } from '../core/events/payloads/user-deleted.event';

/**
 * Step 3 baseline: UsersService is now a pure domain service. The auth concerns
 * (password rotation, secret scrubbing, session revocation) have moved to
 * `UserPasswordService` / `UserLifecycleService` and are covered by their own
 * specs in the auth module.
 */
describe('UsersService', () => {
  let service: UsersService;
  let userRepo: jest.Mocked<UserRepository>;
  let auditLogsService: { log: jest.Mock };
  let clsService: { get: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: 'hashed-password',
    hashedRefreshToken: 'hashed-refresh',
    isActive: true,
    isSuperAdmin: false,
    organizationId: 'org-123',
    defaultRole: 'Developer',
    passwordVersion: 3,
    mustChangePassword: false,
    avatarUrl: undefined,
    emailVerified: true,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
  } as User;

  beforeEach(async () => {
    auditLogsService = { log: jest.fn().mockResolvedValue(undefined) };
    clsService = { get: jest.fn().mockReturnValue('request-123') };
    eventEmitter = { emit: jest.fn().mockReturnValue(true) };

    userRepo = {
      create: jest.fn().mockImplementation((dto: Partial<User>) => dto as User),
      save: jest
        .fn()
        .mockImplementation((user: User) =>
          Promise.resolve({ ...mockUser, ...user }),
        ),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findMany: jest.fn(),
      findByVerificationToken: jest.fn(),
      searchUsers: jest.fn(),
      findAllWithMemberships: jest.fn(),
      findUnassigned: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserRepository, useValue: userRepo },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ClsService, useValue: clsService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a user with sane defaults', async () => {
      await service.create('new@example.com', 'hashed-password', 'New User');

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          passwordHash: 'hashed-password',
          name: 'New User',
          isSuperAdmin: false,
          passwordVersion: 1,
          emailVerified: false,
        }),
      );
      expect(userRepo.save).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns every user when no organisation is provided', async () => {
      userRepo.findMany.mockResolvedValue([mockUser]);
      await service.findAll();
      expect(userRepo.findMany).toHaveBeenCalledWith();
    });

    it('scopes results to the organisation when provided', async () => {
      userRepo.findMany.mockResolvedValue([mockUser]);
      await service.findAll('org-123');
      expect(userRepo.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
      });
    });
  });

  describe('findOneById', () => {
    it('returns the user when found', async () => {
      userRepo.findById.mockResolvedValue(mockUser);
      const result = await service.findOneById('user-123');
      expect(result).toEqual(mockUser);
    });

    it('throws NotFoundException when missing', async () => {
      userRepo.findById.mockResolvedValue(null);
      await expect(service.findOneById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOneByEmail', () => {
    it('lower-cases the email before lookup', async () => {
      userRepo.findByEmail.mockResolvedValue(mockUser);
      await service.findOneByEmail('TEST@EXAMPLE.COM');
      expect(userRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('returns null when not found', async () => {
      userRepo.findByEmail.mockResolvedValue(null);
      const result = await service.findOneByEmail('missing@example.com');
      expect(result).toBeNull();
    });
  });

  describe('verifyEmail', () => {
    const token = 'a'.repeat(64);

    it('rejects malformed tokens before hitting the DB', async () => {
      await expect(service.verifyEmail('short')).rejects.toThrow(
        BadRequestException,
      );
      expect(userRepo.findByVerificationToken).not.toHaveBeenCalled();
    });

    it('is idempotent for already-verified users', async () => {
      userRepo.findByVerificationToken.mockResolvedValue({
        ...mockUser,
        emailVerified: true,
      } as User);
      const result = await service.verifyEmail(token);
      expect(result).toEqual({
        success: true,
        message: 'Email is already verified',
      });
    });
  });

  describe('deleteAccount', () => {
    it('anonymises domain PII and emits USER_DELETED_EVENT', async () => {
      userRepo.findById.mockResolvedValue({ ...mockUser } as User);

      const result = await service.deleteAccount('user-123');

      expect(result.success).toBe(true);
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          name: 'Deleted User',
          email: expect.stringContaining('deleted-'),
          avatarUrl: undefined,
        }),
      );

      // Secrets are NOT scrubbed here any more — that is the listener's job.
      const saved = userRepo.save.mock.calls[0]?.[0] as User;
      expect(saved.passwordHash).toBe('hashed-password');
      expect(saved.hashedRefreshToken).toBe('hashed-refresh');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        USER_DELETED_EVENT,
        expect.objectContaining({
          userId: 'user-123',
          originalEmail: 'test@example.com',
          originalName: 'Test User',
          organizationId: 'org-123',
          requestId: 'request-123',
        }),
      );
    });

    it('logs a CRITICAL audit event', async () => {
      userRepo.findById.mockResolvedValue({ ...mockUser } as User);
      await service.deleteAccount('user-123');
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_DELETED',
          action_type: 'DELETE',
          metadata: expect.objectContaining({
            severity: 'CRITICAL',
            originalEmail: 'test@example.com',
            originalName: 'Test User',
          }),
        }),
      );
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userRepo.findById.mockResolvedValue(null);
      await expect(service.deleteAccount('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { AuditLogsService } from '../audit/audit-logs.service';
import { ClsService } from 'nestjs-cls';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

// Mock argon2
jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn().mockResolvedValue('new-argon2-hash'),
  argon2id: 2,
}));

describe('UsersService', () => {
  let service: UsersService;
  let userRepo: any;
  let mockAuditLogsService: any;
  let mockClsService: any;

  // Test fixtures
  const mockUser: Partial<User> = {
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
  };

  const createMockQueryBuilder = () => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    subQuery: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    getQuery: jest.fn().mockReturnValue('subquery'),
    getRawMany: jest.fn().mockResolvedValue([]),
    getMany: jest.fn().mockResolvedValue([]),
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAuditLogsService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockClsService = {
      get: jest.fn().mockReturnValue('request-123'),
    };

    const mockQueryBuilder = createMockQueryBuilder();

    userRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((user) => Promise.resolve({ id: 'new-user-123', ...user })),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: ClsService, useValue: mockClsService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  // CREATE TESTS
  // ===========================================
  describe('create', () => {
    it('should create a new user', async () => {
      const result = await service.create(
        'new@example.com',
        'hashed-password',
        'New User',
        false,
        'org-123',
        'Developer',
        3,
      );

      expect(result).toBeDefined();
      expect(userRepo.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        passwordHash: 'hashed-password',
        name: 'New User',
        isSuperAdmin: false,
        organizationId: 'org-123',
        defaultRole: 'Developer',
        passwordVersion: 3,
      });
      expect(userRepo.save).toHaveBeenCalled();
    });

    it('should set isSuperAdmin to false by default', async () => {
      await service.create('new@example.com', 'hash', 'User');

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isSuperAdmin: false,
        }),
      );
    });

    it('should set passwordVersion to 1 by default', async () => {
      await service.create('new@example.com', 'hash', 'User');

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          passwordVersion: 1,
        }),
      );
    });
  });

  // ===========================================
  // FIND ALL TESTS
  // ===========================================
  describe('findAll', () => {
    it('should return all users when no organizationId provided', async () => {
      userRepo.find.mockResolvedValue([mockUser]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(userRepo.find).toHaveBeenCalledWith();
    });

    it('should filter by organizationId when provided', async () => {
      userRepo.find.mockResolvedValue([mockUser]);

      await service.findAll('org-123');

      expect(userRepo.find).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
      });
    });
  });

  // ===========================================
  // FIND ONE BY ID TESTS
  // ===========================================
  describe('findOneById', () => {
    it('should return user when found', async () => {
      userRepo.findOneBy.mockResolvedValue(mockUser);

      const result = await service.findOneById('user-123');

      expect(result).toEqual(mockUser);
      expect(userRepo.findOneBy).toHaveBeenCalledWith({ id: 'user-123' });
    });

    it('should throw NotFoundException when user not found', async () => {
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(service.findOneById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ===========================================
  // FIND ONE BY EMAIL TESTS
  // ===========================================
  describe('findOneByEmail', () => {
    it('should return user when found', async () => {
      userRepo.findOneBy.mockResolvedValue(mockUser);

      const result = await service.findOneByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(userRepo.findOneBy).toHaveBeenCalledWith({ email: 'test@example.com' });
    });

    it('should return null when user not found', async () => {
      userRepo.findOneBy.mockResolvedValue(null);

      const result = await service.findOneByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should lowercase email before searching', async () => {
      userRepo.findOneBy.mockResolvedValue(mockUser);

      await service.findOneByEmail('TEST@EXAMPLE.COM');

      expect(userRepo.findOneBy).toHaveBeenCalledWith({ email: 'test@example.com' });
    });
  });

  // ===========================================
  // SET ACTIVE TESTS
  // ===========================================
  describe('setActive', () => {
    it('should activate a user', async () => {
      userRepo.findOneBy.mockResolvedValue({ ...mockUser, isActive: false });
      userRepo.save.mockImplementation((user) => Promise.resolve(user));

      const result = await service.setActive('user-123', true);

      expect(result.isActive).toBe(true);
      expect(userRepo.save).toHaveBeenCalled();
    });

    it('should deactivate a user', async () => {
      userRepo.findOneBy.mockResolvedValue({ ...mockUser, isActive: true });
      userRepo.save.mockImplementation((user) => Promise.resolve(user));

      const result = await service.setActive('user-123', false);

      expect(result.isActive).toBe(false);
    });
  });

  // ===========================================
  // UPDATE TESTS
  // ===========================================
  describe('update', () => {
    beforeEach(() => {
      userRepo.findOneBy.mockResolvedValue({ ...mockUser });
      userRepo.save.mockImplementation((user) => Promise.resolve(user));
    });

    it('should update user name', async () => {
      const result = await service.update('user-123', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('should update user avatarUrl', async () => {
      const result = await service.update('user-123', {
        avatarUrl: 'https://example.com/avatar.jpg',
      });

      expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('should update user defaultRole', async () => {
      const result = await service.update('user-123', {
        defaultRole: 'Project Lead',
      });

      expect(result.defaultRole).toBe('Project Lead');
    });

    it('should update hashedRefreshToken', async () => {
      const result = await service.update('user-123', {
        hashedRefreshToken: 'new-hash',
      });

      expect(result.hashedRefreshToken).toBe('new-hash');
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.update('non-existent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  // SEARCH TESTS
  // ===========================================
  describe('search', () => {
    it('should search users by name or email', async () => {
      const mockQb = createMockQueryBuilder();
      mockQb.getRawMany.mockResolvedValue([
        { user_id: 'user-1', user_name: 'Test', user_email: 'test@example.com' },
      ]);
      userRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.search('test');

      expect(result).toHaveLength(1);
      expect(mockQb.take).toHaveBeenCalledWith(10);
    });

    it('should filter by organizationId when provided', async () => {
      const mockQb = createMockQueryBuilder();
      userRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.search('test', undefined, 'org-123');

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'user.organizationId = :organizationId',
        { organizationId: 'org-123' },
      );
    });

    it('should exclude users in project when excludeProjectId provided', async () => {
      const mockQb = createMockQueryBuilder();
      userRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.search('test', 'project-123');

      expect(mockQb.andWhere).toHaveBeenCalled();
    });
  });

  // ===========================================
  // CHANGE PASSWORD TESTS
  // ===========================================
  describe('changePassword', () => {
    const changePasswordDto = {
      currentPassword: 'oldpassword',
      newPassword: 'newsecurepassword',
      confirmNewPassword: 'newsecurepassword',
    };

    beforeEach(() => {
      userRepo.findOneBy.mockResolvedValue({ ...mockUser });
      userRepo.save.mockImplementation((user) => Promise.resolve(user));
    });

    it('should change password when current password is correct', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.changePassword(
        'user-123',
        changePasswordDto,
        false,
      );

      expect(result.success).toBe(true);
      expect(argon2.hash).toHaveBeenCalledWith(
        'newsecurepassword',
        expect.any(Object),
      );
      expect(userRepo.save).toHaveBeenCalled();
    });

    it('should log audit event on password change', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await service.changePassword('user-123', changePasswordDto, false);

      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PASSWORD_CHANGE',
          metadata: expect.objectContaining({
            severity: 'HIGH',
          }),
        }),
      );
    });

    it('should throw ForbiddenException if current password is incorrect', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-123', changePasswordDto, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if no current password for non-admin', async () => {
      await expect(
        service.changePassword(
          'user-123',
          { ...changePasswordDto, currentPassword: undefined } as any,
          false,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow super admin to change password without current', async () => {
      const result = await service.changePassword(
        'user-123',
        {
          newPassword: 'newsecurepassword',
          confirmNewPassword: 'newsecurepassword',
        } as any,
        true, // isSuperAdmin
      );

      expect(result.success).toBe(true);
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if password too short', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changePassword(
          'user-123',
          { ...changePasswordDto, newPassword: '12345', confirmNewPassword: '12345' },
          false,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if passwords do not match', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changePassword(
          'user-123',
          { ...changePasswordDto, confirmNewPassword: 'different' },
          false,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update passwordVersion to 3 (Argon2id)', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await service.changePassword('user-123', changePasswordDto, false);

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          passwordVersion: 3,
        }),
      );
    });
  });

  // ===========================================
  // DELETE ACCOUNT TESTS
  // ===========================================
  describe('deleteAccount', () => {
    beforeEach(() => {
      userRepo.findOneBy.mockResolvedValue({ ...mockUser });
      userRepo.save.mockImplementation((user) => Promise.resolve(user));
    });

    it('should soft-delete and anonymize user data', async () => {
      const result = await service.deleteAccount('user-123');

      expect(result.success).toBe(true);
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          name: 'Deleted User',
          email: expect.stringContaining('deleted-'),
          avatarUrl: undefined,
          hashedRefreshToken: undefined,
          passwordHash: '',
        }),
      );
    });

    it('should log critical audit event', async () => {
      await service.deleteAccount('user-123');

      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
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

    it('should throw NotFoundException if user not found', async () => {
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(service.deleteAccount('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ===========================================
  // FIND UNASSIGNED TESTS
  // ===========================================
  describe('findUnassigned', () => {
    it('should return users not assigned to any project', async () => {
      const mockQb = createMockQueryBuilder();
      mockQb.getMany.mockResolvedValue([{ id: 'user-1', name: 'Unassigned User' }]);
      userRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findUnassigned();

      expect(result).toHaveLength(1);
      expect(mockQb.where).toHaveBeenCalledWith('pm.userId IS NULL');
    });

    it('should filter by organization when provided', async () => {
      const mockQb = createMockQueryBuilder();
      mockQb.getMany.mockResolvedValue([]);
      userRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.findUnassigned('org-123');

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'user.organizationId = :organizationId',
        { organizationId: 'org-123' },
      );
    });
  });
});

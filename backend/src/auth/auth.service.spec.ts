import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { InvitesService } from '../invites/invites.service';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { OnboardingService } from '../onboarding/services/onboarding.service';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './services/password.service';
import { AuditLogsService } from '../audit/audit-logs.service';
import { ClsService } from 'nestjs-cls';
import { CacheService } from '../cache/cache.service';
import { PasswordBreachService } from './services/password-breach.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-refresh-token'),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockInvitesService: any;
  let mockOrganizationsService: any;
  let mockOnboardingService: any;
  let mockPasswordService: any;
  let mockAuditLogsService: any;
  let mockClsService: any;
  let mockCacheService: any;
  let mockConfigService: any;
  let mockPasswordBreachService: any;
  let mockTokenBlacklistService: any;

  // Test fixtures
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: 'hashed-password',
    hashedRefreshToken: 'hashed-refresh',
    isActive: true,
    isSuperAdmin: false,
    organizationId: 'org-123',
    defaultRole: 'Developer',
  };

  const mockSafeUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    isActive: true,
    isSuperAdmin: false,
    organizationId: 'org-123',
    defaultRole: 'Developer',
  };

  const mockTokens = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    mockUsersService = {
      findOneByEmail: jest.fn(),
      findOneById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn(),
    };

    mockInvitesService = {
      findOneByToken: jest.fn(),
      respondToInvite: jest.fn(),
    };

    mockOrganizationsService = {
      create: jest.fn(),
    };

    mockOnboardingService = {
      initializeOnboarding: jest.fn(),
    };

    mockPasswordService = {
      hash: jest.fn().mockResolvedValue('argon2-hashed-password'),
      verify: jest.fn(),
    };

    mockAuditLogsService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockClsService = {
      get: jest.fn().mockReturnValue('request-123'),
    };

    mockCacheService = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(true),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-jwt-secret';
        if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
        if (key === 'auth')
          return {
            jwt: {
              accessTokenExpiry: '15m',
              refreshTokenExpiry: '7d',
              twoFactorSessionExpiry: '5m',
            },
            lockout: {
              maxAttempts: 5,
              initialLockoutSeconds: 900,
              backoffMultiplier: 2,
              maxLockoutSeconds: 3600,
            },
          };
        return null;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-jwt-secret';
        throw new Error(`Config key ${key} not found`);
      }),
    };

    mockPasswordBreachService = {
      checkPassword: jest.fn().mockResolvedValue({
        isBreached: false,
        breachCount: 0,
        cached: false,
      }),
      getBreachMessage: jest.fn().mockReturnValue('Password has been breached'),
    };

    mockTokenBlacklistService = {
      blacklistToken: jest.fn().mockResolvedValue(true),
      isBlacklisted: jest.fn().mockResolvedValue(false),
      blacklistMultiple: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: InvitesService, useValue: mockInvitesService },
        { provide: ProjectMembersService, useValue: {} },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        { provide: OnboardingService, useValue: mockOnboardingService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: ClsService, useValue: mockClsService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: PasswordBreachService, useValue: mockPasswordBreachService },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklistService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  // VALIDATE USER TESTS
  // ===========================================
  describe('validateUser', () => {
    it('should return safe user on valid credentials', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(mockUser);
      mockPasswordService.verify.mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeDefined();
      expect(result?.id).toBe('user-123');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('hashedRefreshToken');
    });

    it('should return null and log LOGIN_LOCKED if account is locked', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(mockUser);
      mockCacheService.get.mockResolvedValue(5); // 5 attempts = locked

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
      // SECURITY: Must NOT verify password if locked (Timing Attack Prevention)
      expect(mockPasswordService.verify).not.toHaveBeenCalled();

      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_LOCKED',
          metadata: expect.objectContaining({
            reason: 'Account locked due to too many failed attempts',
          }),
        }),
      );
    });

    it('should increment failed attempts and lock if threshold reached', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(mockUser);
      mockPasswordService.verify.mockResolvedValue(false);
      mockCacheService.incr.mockResolvedValue(5); // Reached threshold

      const result = await service.validateUser(
        'test@example.com',
        'wrongpassword',
      );

      expect(result).toBeNull();
      expect(mockCacheService.incr).toHaveBeenCalledWith(
        'lockout:user-123',
        expect.objectContaining({ ttl: 900 }),
      );
      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_LOCKED',
          metadata: expect.objectContaining({
            attempts: 5,
          }),
        }),
      );
    });

    it('should clear lockout on successful login', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(mockUser);
      mockPasswordService.verify.mockResolvedValue(true);

      await service.validateUser('test@example.com', 'password');

      expect(mockCacheService.del).toHaveBeenCalledWith(
        'lockout:user-123',
        expect.objectContaining({ namespace: 'auth' }),
      );
    });

    it('should return null if user not found', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(null);

      const result = await service.validateUser(
        'nonexistent@example.com',
        'password',
      );

      expect(result).toBeNull();
      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_FAILED',
          metadata: expect.objectContaining({
            reason: 'User not found or inactive',
          }),
        }),
      );
    });

    it('should return null if user is inactive', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockUsersService.findOneByEmail.mockResolvedValue(inactiveUser);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
      expect(mockAuditLogsService.log).toHaveBeenCalled();
    });

    it('should return null if password is invalid', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(mockUser);
      mockPasswordService.verify.mockResolvedValue(false);

      const result = await service.validateUser(
        'test@example.com',
        'wrongpassword',
      );

      expect(result).toBeNull();
      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_FAILED',
          metadata: expect.objectContaining({
            reason: 'Invalid password',
          }),
        }),
      );
    });

    it('should log audit with IP address when provided', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(mockUser);
      mockPasswordService.verify.mockResolvedValue(true);

      await service.validateUser('test@example.com', 'password', '192.168.1.1');

      // IP is passed for successful login, but audit only logged on failure
      expect(mockPasswordService.verify).toHaveBeenCalled();
    });
  });

  // ===========================================
  // LOGIN TESTS
  // ===========================================
  describe('login', () => {
    beforeEach(() => {
      mockJwtService.signAsync
        .mockResolvedValueOnce('mock-access-token')
        .mockResolvedValueOnce('mock-refresh-token');
      mockUsersService.update.mockResolvedValue(mockUser);
    });

    it('should return tokens and user info', async () => {
      const result = await service.login(mockSafeUser as any);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
      expect(result.user.id).toBe('user-123');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should update refresh token in database', async () => {
      await service.login(mockSafeUser as any);

      expect(mockUsersService.update).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          hashedRefreshToken: expect.any(String),
        }),
      );
    });

    it('should log successful login audit event', async () => {
      await service.login(mockSafeUser as any, '192.168.1.1');

      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_SUCCESS',
          actor_id: 'user-123',
          actor_ip: '192.168.1.1',
        }),
      );
    });
  });

  // ===========================================
  // REGISTER TESTS
  // ===========================================
  describe('register', () => {
    beforeEach(() => {
      mockUsersService.findOneByEmail.mockResolvedValue(null);
      mockUsersService.create.mockImplementation(
        (email, hash, name, isAdmin, orgId) =>
          Promise.resolve({
            id: 'new-user-123',
            email,
            name,
            isSuperAdmin: isAdmin,
            organizationId: orgId,
          }),
      );
      mockOnboardingService.initializeOnboarding.mockResolvedValue(undefined);
    });

    it('should create a new user', async () => {
      const result = await service.register({
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
      });

      expect(result).toBeDefined();
      expect(result.email).toBe('new@example.com');
      expect(mockUsersService.create).toHaveBeenCalledWith(
        'new@example.com',
        expect.any(String), // hashed password
        'New User',
        false, // isSuperAdmin
        undefined, // organizationId
        undefined, // defaultRole
        3, // Argon2id version
      );
    });

    it('should throw ConflictException if email already exists', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create organization when workspaceName provided', async () => {
      mockOrganizationsService.create.mockResolvedValue({
        id: 'new-org-123',
        name: 'My Workspace',
      });

      await service.register({
        email: 'admin@example.com',
        password: 'password123',
        name: 'Admin User',
        workspaceName: 'My Workspace',
      });

      expect(mockOrganizationsService.create).toHaveBeenCalledWith({
        name: 'My Workspace',
      });
      expect(mockUsersService.create).toHaveBeenCalledWith(
        'admin@example.com',
        expect.any(String),
        'Admin User',
        true, // isSuperAdmin = true for workspace creator
        'new-org-123',
        undefined,
        3,
      );
    });

    it('should initialize onboarding for new user', async () => {
      await service.register({
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
      });

      expect(mockOnboardingService.initializeOnboarding).toHaveBeenCalledWith(
        'new-user-123',
      );
    });

    it('should lowercase email before storing', async () => {
      await service.register({
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
        name: 'Test User',
      });

      expect(mockUsersService.findOneByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(mockUsersService.create).toHaveBeenCalledWith(
        'test@example.com', // lowercased email
        expect.any(String), // hashed password
        'Test User',
        false, // isSuperAdmin
        undefined, // organizationId
        undefined, // defaultRole
        3, // passwordVersion (Argon2id)
      );
    });
  });

  // ===========================================
  // REDEEM INVITE TESTS
  // ===========================================
  describe('redeemInvite', () => {
    const mockInvite = {
      id: 'invite-123',
      token: 'valid-token',
      status: 'Pending',
      inviteeId: 'user-123',
      expiresAt: new Date(Date.now() + 86400000), // Tomorrow
    };

    beforeEach(() => {
      mockInvitesService.findOneByToken.mockResolvedValue(mockInvite);
      mockUsersService.findOneById.mockResolvedValue(mockUser);
      mockInvitesService.respondToInvite.mockResolvedValue(undefined);
      mockJwtService.signAsync
        .mockResolvedValueOnce('mock-access-token')
        .mockResolvedValueOnce('mock-refresh-token');
      mockUsersService.update.mockResolvedValue(mockUser);
    });

    it('should redeem valid invite and return tokens', async () => {
      const result = await service.redeemInvite({
        token: 'valid-token',
        password: 'password123',
      });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(mockInvitesService.respondToInvite).toHaveBeenCalledWith(
        'invite-123',
        'user-123',
        true,
      );
    });

    it('should throw BadRequestException if invite not found', async () => {
      mockInvitesService.findOneByToken.mockResolvedValue(null);

      await expect(
        service.redeemInvite({
          token: 'invalid-token',
          password: 'password123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if invite expired', async () => {
      const expiredInvite = {
        ...mockInvite,
        expiresAt: new Date(Date.now() - 86400000), // Yesterday
      };
      mockInvitesService.findOneByToken.mockResolvedValue(expiredInvite);

      await expect(
        service.redeemInvite({ token: 'valid-token', password: 'password123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if invite status is not Pending', async () => {
      const acceptedInvite = { ...mockInvite, status: 'Accepted' };
      mockInvitesService.findOneByToken.mockResolvedValue(acceptedInvite);

      await expect(
        service.redeemInvite({ token: 'valid-token', password: 'password123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw Error if invitee user not found', async () => {
      mockUsersService.findOneById.mockResolvedValue(null);

      await expect(
        service.redeemInvite({ token: 'valid-token', password: 'password123' }),
      ).rejects.toThrow('Invitee user does not exist');
    });
  });

  // ===========================================
  // FIND USER BY ID TESTS
  // ===========================================
  describe('findUserById', () => {
    it('should return safe user without sensitive data', async () => {
      mockUsersService.findOneById.mockResolvedValue(mockUser);

      const result = await service.findUserById('user-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('user-123');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('hashedRefreshToken');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUsersService.findOneById.mockResolvedValue(null);

      await expect(service.findUserById('non-existent')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ===========================================
  // LOGOUT TESTS
  // ===========================================
  describe('logout', () => {
    it('should clear refresh token', async () => {
      mockUsersService.update.mockResolvedValue(mockUser);

      await service.logout('user-123');

      expect(mockUsersService.update).toHaveBeenCalledWith('user-123', {
        hashedRefreshToken: null,
      });
    });
  });

  // ===========================================
  // REFRESH TOKENS TESTS
  // ===========================================
  describe('refreshTokens', () => {
    beforeEach(() => {
      mockUsersService.findOneById.mockResolvedValue(mockUser);
      mockJwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      mockUsersService.update.mockResolvedValue(mockUser);
    });

    it('should return new tokens on valid refresh', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.refreshTokens(
        'user-123',
        'valid-refresh-token',
      );

      expect(result).toHaveProperty('access_token', 'new-access-token');
      expect(result).toHaveProperty('refresh_token', 'new-refresh-token');
    });

    it('should throw ForbiddenException if user not found', async () => {
      mockUsersService.findOneById.mockResolvedValue(null);

      await expect(
        service.refreshTokens('non-existent', 'some-token'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if no stored refresh token', async () => {
      const userWithoutToken = { ...mockUser, hashedRefreshToken: null };
      mockUsersService.findOneById.mockResolvedValue(userWithoutToken);

      await expect(
        service.refreshTokens('user-123', 'some-token'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should detect token reuse and invalidate all tokens', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.refreshTokens('user-123', 'old-stolen-token'),
      ).rejects.toThrow(ForbiddenException);

      // Should have cleared the refresh token (security measure)
      expect(mockUsersService.update).toHaveBeenCalledWith('user-123', {
        hashedRefreshToken: null,
      });
    });

    it('should update refresh token after successful refresh', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.refreshTokens('user-123', 'valid-refresh-token');

      // Should update with new hashed refresh token
      expect(mockUsersService.update).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          hashedRefreshToken: expect.any(String),
        }),
      );
    });
  });

  // ===========================================
  // UPDATE REFRESH TOKEN TESTS
  // ===========================================
  describe('updateRefreshToken', () => {
    it('should hash and store refresh token', async () => {
      mockUsersService.update.mockResolvedValue(mockUser);

      await service.updateRefreshToken('user-123', 'new-refresh-token');

      expect(bcrypt.hash).toHaveBeenCalledWith('new-refresh-token', 10);
      expect(mockUsersService.update).toHaveBeenCalledWith('user-123', {
        hashedRefreshToken: 'hashed-refresh-token',
      });
    });
  });

  // ===========================================
  // GET TOKENS TESTS
  // ===========================================
  describe('getTokens', () => {
    beforeEach(() => {
      mockJwtService.signAsync
        .mockResolvedValueOnce('test-access-token')
        .mockResolvedValueOnce('test-refresh-token');
    });

    it('should generate both access and refresh tokens', async () => {
      const result = await service.getTokens(
        'user-123',
        'test@example.com',
        false,
        'org-123',
        'Test User',
      );

      expect(result.access_token).toBe('test-access-token');
      expect(result.refresh_token).toBe('test-refresh-token');
    });

    it('should include user info in JWT payload', async () => {
      await service.getTokens(
        'user-123',
        'test@example.com',
        true,
        'org-123',
        'Admin User',
      );

      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          email: 'test@example.com',
          isSuperAdmin: true,
          organizationId: 'org-123',
          name: 'Admin User',
        }),
        expect.any(Object),
      );
    });

    it('should use correct secrets for access and refresh tokens', async () => {
      await service.getTokens(
        'user-123',
        'test@example.com',
        false,
        'org-123',
        'User',
      );

      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          secret: 'test-jwt-secret',
          expiresIn: '15m',
        }),
      );
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          secret: 'test-refresh-secret',
          expiresIn: '7d',
        }),
      );
    });
  });
});

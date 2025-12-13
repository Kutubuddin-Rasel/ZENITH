import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TokenManagerService } from './token-manager.service';
import { IntegrationService } from './integration.service';
import { OAuthService } from './oauth.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { Integration, IntegrationType } from '../entities/integration.entity';

describe('TokenManagerService', () => {
  let service: TokenManagerService;

  const mockIntegrationRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockIntegrationService = {
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    updateTokens: jest.fn(),
  };

  const mockOAuthService = {
    refreshAccessToken: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn((value: string) => `encrypted_${value}`),
    decrypt: jest.fn((value: string) => value.replace('encrypted_', '')),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenManagerService,
        {
          provide: getRepositoryToken(Integration),
          useValue: mockIntegrationRepo,
        },
        { provide: IntegrationService, useValue: mockIntegrationService },
        { provide: OAuthService, useValue: mockOAuthService },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<TokenManagerService>(TokenManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeWithTokenRefresh', () => {
    it('should execute function with valid token', async () => {
      const integration = {
        id: '1',
        type: IntegrationType.GITHUB,
        authConfig: {
          accessToken: 'valid-token',
          expiresAt: new Date(Date.now() + 3600000), // Valid for 1h
        },
      } as Integration;

      mockIntegrationRepo.findOne.mockResolvedValue(integration);
      mockIntegrationService.getAccessToken.mockReturnValue('valid-token');

      const mockFn = jest.fn().mockResolvedValue('result');
      const result = await service.executeWithTokenRefresh('1', mockFn);

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledWith('valid-token');
    });

    it('should refresh token when expired and retry', async () => {
      const expiredIntegration = {
        id: '1',
        type: IntegrationType.GITHUB,
        authConfig: {
          accessToken: 'expired-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() - 1000), // Expired
        },
      } as Integration;

      const refreshedIntegration = {
        ...expiredIntegration,
        authConfig: {
          ...expiredIntegration.authConfig,
          accessToken: 'new-token',
          expiresAt: new Date(Date.now() + 3600000),
        },
      } as Integration;

      mockIntegrationRepo.findOne.mockResolvedValue(expiredIntegration);
      mockIntegrationService.getAccessToken
        .mockReturnValueOnce('expired-token')
        .mockReturnValueOnce('new-token');
      mockIntegrationService.getRefreshToken.mockReturnValue('refresh-token');
      mockOAuthService.refreshAccessToken.mockResolvedValue({
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      });
      mockIntegrationRepo.save.mockResolvedValue(refreshedIntegration);

      const mockFn = jest.fn().mockResolvedValue('success');
      const result = await service.executeWithTokenRefresh('1', mockFn);

      expect(result).toBe('success');
    });
  });

  describe('validateToken', () => {
    it('should return true for valid token', async () => {
      const integration = {
        id: '1',
        type: IntegrationType.GITHUB,
        authConfig: {
          accessToken: 'valid-token',
          expiresAt: new Date(Date.now() + 3600000),
        },
      } as Integration;

      mockIntegrationRepo.findOne.mockResolvedValue(integration);
      mockIntegrationService.getAccessToken.mockReturnValue('valid-token');

      const isValid = await service.validateToken('1');
      expect(isValid).toBe(true);
    });

    it('should return false for expired token', async () => {
      const integration = {
        id: '1',
        type: IntegrationType.GITHUB,
        authConfig: {
          accessToken: 'expired-token',
          expiresAt: new Date(Date.now() - 1000),
        },
      } as Integration;

      mockIntegrationRepo.findOne.mockResolvedValue(integration);
      mockIntegrationService.getAccessToken.mockReturnValue('expired-token');

      const isValid = await service.validateToken('1');
      expect(isValid).toBe(false);
    });

    it('should return false for non-existent integration', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);

      const isValid = await service.validateToken('non-existent');
      expect(isValid).toBe(false);
    });
  });
});

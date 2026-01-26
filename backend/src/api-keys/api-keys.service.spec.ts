import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysService } from './api-keys.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiKey } from './entities/api-key.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let repo: any;

  const mockApiKey = {
    id: 'key-1',
    name: 'Test Key',
    keyHash: 'hashed_secret',
    keyPrefix: 'zth_live_prefix',
    userId: 'u1',
    isActive: true,
    expiresAt: null,
  };

  beforeEach(async () => {
    const mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: getRepositoryToken(ApiKey), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
    repo = module.get(getRepositoryToken(ApiKey));

    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_secret');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  describe('create', () => {
    it('should create and return plain key', async () => {
      repo.create.mockReturnValue(mockApiKey);
      repo.save.mockResolvedValue(mockApiKey);

      const result = await service.create('u1', {
        name: 'Test',
        projectId: 'p1',
        scopes: [],
      });

      expect(result.key).toContain('zth_live_');
      expect(result.apiKey).toEqual(mockApiKey);
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('validateKey', () => {
    it('should return null if format invalid', async () => {
      const result = await service.validateKey('invalid');
      expect(result).toBeNull();
    });

    it('should return key if valid', async () => {
      repo.find.mockResolvedValue([mockApiKey]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateKey('zth_live_validkey');

      expect(result).toEqual(mockApiKey);
      expect(repo.update).toHaveBeenCalled(); // lastUsedAt update
    });

    it('should return null if hash mismatch', async () => {
      repo.find.mockResolvedValue([mockApiKey]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateKey('zth_live_wrongkey');
      expect(result).toBeNull();
    });

    it('should return null if expired', async () => {
      const expiredKey = {
        ...mockApiKey,
        expiresAt: new Date(Date.now() - 10000),
      };
      repo.find.mockResolvedValue([expiredKey]);

      const result = await service.validateKey('zth_live_expired');
      expect(result).toBeNull();
    });
  });

  describe('revoke', () => {
    it('should remove key', async () => {
      repo.findOne.mockResolvedValue(mockApiKey);
      await service.revoke('key-1', 'u1');
      expect(repo.remove).toHaveBeenCalledWith(mockApiKey);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { SECURE_RANDOM_TOKEN } from '../../../encryption';
import {
  CSRF_CONFIG_TOKEN,
  CSRF_TOKEN_REPOSITORY_TOKEN,
} from '../constants/csrf.tokens';
import { CsrfTokenCommandService } from '../services/csrf-token-command.service';

describe('CsrfTokenCommandService', () => {
  let service: CsrfTokenCommandService;
  const repo = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };
  const secureRandom = { generateSecureRandom: jest.fn() };
  const config = {
    tokenTtlSeconds: 3600,
    failureThreshold: 10,
    failureWindowSeconds: 300,
    banDurationSeconds: 300,
    headerName: 'X-CSRF-Token',
    cookieName: 'csrf_token',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsrfTokenCommandService,
        { provide: CSRF_TOKEN_REPOSITORY_TOKEN, useValue: repo },
        { provide: SECURE_RANDOM_TOKEN, useValue: secureRandom },
        { provide: CSRF_CONFIG_TOKEN, useValue: config },
      ],
    }).compile();
    service = module.get(CsrfTokenCommandService);
  });

  describe('generateToken — defense-in-depth userId guard', () => {
    it('throws when userId is empty string', async () => {
      await expect(service.generateToken('')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(secureRandom.generateSecureRandom).not.toHaveBeenCalled();
    });

    it('throws when userId is whitespace-only', async () => {
      await expect(service.generateToken('   ')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('throws when userId is non-string', async () => {
      await expect(service.generateToken(null as any)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('generateToken — multi-tab reuse semantics', () => {
    it('reuses existing token and refreshes TTL within window', async () => {
      repo.get.mockResolvedValueOnce('existing-tok');
      const out = await service.generateToken('user-1');
      expect(out).toBe('existing-tok');
      expect(secureRandom.generateSecureRandom).not.toHaveBeenCalled();
      expect(repo.set).toHaveBeenCalledWith('user-1', 'existing-tok', 3600);
    });

    it('mints a new token when no existing token', async () => {
      repo.get.mockResolvedValueOnce(null);
      secureRandom.generateSecureRandom.mockReturnValueOnce('fresh-tok');
      const out = await service.generateToken('user-2');
      expect(out).toBe('fresh-tok');
      expect(secureRandom.generateSecureRandom).toHaveBeenCalledWith(32);
      expect(repo.set).toHaveBeenCalledWith('user-2', 'fresh-tok', 3600);
    });
  });

  describe('invalidateToken', () => {
    it('no-ops on empty userId (never touches the repository)', async () => {
      await service.invalidateToken('');
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('deletes the user token when called with valid userId', async () => {
      await service.invalidateToken('user-3');
      expect(repo.delete).toHaveBeenCalledWith('user-3');
    });
  });
});

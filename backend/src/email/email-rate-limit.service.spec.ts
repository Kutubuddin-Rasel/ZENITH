import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailRateLimitService } from './email-rate-limit.service';
import { CacheService } from '../cache/cache.service';

describe('EmailRateLimitService', () => {
  let service: EmailRateLimitService;
  let cacheService: { incr: jest.Mock; getCounter: jest.Mock };

  const createService = async (
    configOverrides: Record<string, unknown> = {},
  ): Promise<EmailRateLimitService> => {
    const mockCacheService = {
      incr: jest.fn().mockResolvedValue(1),
      getCounter: jest.fn().mockResolvedValue(0),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const defaults: Record<string, unknown> = {
          EMAIL_RATE_LIMIT_MAX: undefined,
          EMAIL_RATE_LIMIT_WINDOW_SECONDS: undefined,
          ...configOverrides,
        };
        return defaults[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailRateLimitService,
        { provide: CacheService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    const svc = module.get<EmailRateLimitService>(EmailRateLimitService);
    cacheService = mockCacheService;
    return svc;
  };

  beforeEach(async () => {
    service = await createService();
  });

  // ==========================================================================
  // CORE RATE LIMITING LOGIC
  // ==========================================================================

  describe('checkRateLimit', () => {
    it('should allow email when count is under the default limit (10)', async () => {
      cacheService.incr.mockResolvedValue(5);

      // Should NOT throw
      await expect(
        service.checkRateLimit('user@example.com'),
      ).resolves.toBeUndefined();
    });

    it('should allow email at exactly the limit boundary (10)', async () => {
      cacheService.incr.mockResolvedValue(10);

      // 10 <= 10, should still be allowed
      await expect(
        service.checkRateLimit('user@example.com'),
      ).resolves.toBeUndefined();
    });

    it('should throw 429 when count exceeds the limit', async () => {
      cacheService.incr.mockResolvedValue(11);

      await expect(service.checkRateLimit('user@example.com')).rejects.toThrow(
        HttpException,
      );

      try {
        await service.checkRateLimit('user@example.com');
      } catch (error) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('should call incr with correct namespace and TTL', async () => {
      cacheService.incr.mockResolvedValue(1);

      await service.checkRateLimit('user@example.com');

      expect(cacheService.incr).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:'),
        expect.objectContaining({
          ttl: 3600,
          namespace: 'email',
        }),
      );
    });
  });

  // ==========================================================================
  // EMAIL NORMALIZATION (CASE-INSENSITIVE + SHA256)
  // ==========================================================================

  describe('email normalization', () => {
    it('should produce the same key for differently-cased emails', async () => {
      cacheService.incr.mockResolvedValue(1);

      await service.checkRateLimit('Test@EXAMPLE.COM');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const firstCallKey = cacheService.incr.mock.calls[0][0] as string;

      await service.checkRateLimit('test@example.com');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const secondCallKey = cacheService.incr.mock.calls[1][0] as string;

      expect(firstCallKey).toBe(secondCallKey);
    });

    it('should produce the same key for emails with trailing whitespace', async () => {
      cacheService.incr.mockResolvedValue(1);

      await service.checkRateLimit('  user@example.com  ');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const firstCallKey = cacheService.incr.mock.calls[0][0] as string;

      await service.checkRateLimit('user@example.com');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const secondCallKey = cacheService.incr.mock.calls[1][0] as string;

      expect(firstCallKey).toBe(secondCallKey);
    });

    it('should produce a SHA256 hash in the key (64 hex chars)', async () => {
      cacheService.incr.mockResolvedValue(1);

      await service.checkRateLimit('user@example.com');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const key = cacheService.incr.mock.calls[0][0] as string;

      // Key format: ratelimit:{64-char-hex}
      expect(key).toMatch(/^ratelimit:[a-f0-9]{64}$/);
    });
  });

  // ==========================================================================
  // FAIL-OPEN BEHAVIOR
  // ==========================================================================

  describe('fail-open when Redis is unavailable', () => {
    it('should allow email when CacheService.incr returns 0 (Redis down)', async () => {
      // CacheService returns 0 on Redis connection failures
      cacheService.incr.mockResolvedValue(0);

      // Should NOT throw — fail-open behavior
      await expect(
        service.checkRateLimit('user@example.com'),
      ).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // CONFIGURABLE LIMITS
  // ==========================================================================

  describe('configurable limits', () => {
    it('should respect custom EMAIL_RATE_LIMIT_MAX from config', async () => {
      const customService = await createService({
        EMAIL_RATE_LIMIT_MAX: 5,
      });

      // 5 should be allowed with limit of 5
      cacheService.incr.mockResolvedValue(5);
      await expect(
        customService.checkRateLimit('user@example.com'),
      ).resolves.toBeUndefined();

      // 6 should be rejected with limit of 5
      cacheService.incr.mockResolvedValue(6);
      await expect(
        customService.checkRateLimit('user@example.com'),
      ).rejects.toThrow(HttpException);
    });

    it('should respect custom EMAIL_RATE_LIMIT_WINDOW_SECONDS from config', async () => {
      const customService = await createService({
        EMAIL_RATE_LIMIT_WINDOW_SECONDS: 7200,
      });

      cacheService.incr.mockResolvedValue(1);
      await customService.checkRateLimit('user@example.com');

      expect(cacheService.incr).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ttl: 7200,
        }),
      );
    });
  });

  // ==========================================================================
  // REMAINING QUOTA
  // ==========================================================================

  describe('getRemainingQuota', () => {
    it('should return full quota when no emails have been sent', async () => {
      cacheService.getCounter.mockResolvedValue(0);

      const remaining = await service.getRemainingQuota('user@example.com');
      expect(remaining).toBe(10); // default max
    });

    it('should return correct remaining count after some sends', async () => {
      cacheService.getCounter.mockResolvedValue(7);

      const remaining = await service.getRemainingQuota('user@example.com');
      expect(remaining).toBe(3);
    });

    it('should return 0 when quota is exhausted', async () => {
      cacheService.getCounter.mockResolvedValue(15);

      const remaining = await service.getRemainingQuota('user@example.com');
      expect(remaining).toBe(0); // clamped to 0, not negative
    });
  });
});

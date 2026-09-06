import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailRateLimitService } from './email-rate-limit.service';
import { CACHE_COUNTER_TOKEN } from '../cache/constants/cache.tokens';

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
        { provide: CACHE_COUNTER_TOKEN, useValue: mockCacheService },
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

  describe('check', () => {
    it('should allow email when count is under the default limit (10)', async () => {
      cacheService.incr.mockResolvedValue(5);

      // Should NOT throw
      await expect(
        service.check('user@example.com'),
      ).resolves.toBeUndefined();
    });

    it('should allow email at exactly the limit boundary (10)', async () => {
      cacheService.incr.mockResolvedValue(10);

      // 10 <= 10, should still be allowed
      await expect(
        service.check('user@example.com'),
      ).resolves.toBeUndefined();
    });

    it('should throw 429 when count exceeds the limit', async () => {
      cacheService.incr.mockResolvedValue(11);

      await expect(service.check('user@example.com')).rejects.toThrow(
        HttpException,
      );

      try {
        await service.check('user@example.com');
      } catch (error) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('should call incr with correct namespace and TTL', async () => {
      cacheService.incr.mockResolvedValue(1);

      await service.check('user@example.com');

      // TTL is 2x the window: the current bucket must outlive its own window
      // so it can still be read as the "previous" bucket by the next one.
      expect(cacheService.incr).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:'),
        expect.objectContaining({
          ttl: 7200,
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

      await service.check('Test@EXAMPLE.COM');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const firstCallKey = cacheService.incr.mock.calls[0][0] as string;

      await service.check('test@example.com');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const secondCallKey = cacheService.incr.mock.calls[1][0] as string;

      expect(firstCallKey).toBe(secondCallKey);
    });

    it('should produce the same key for emails with trailing whitespace', async () => {
      cacheService.incr.mockResolvedValue(1);

      await service.check('  user@example.com  ');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const firstCallKey = cacheService.incr.mock.calls[0][0] as string;

      await service.check('user@example.com');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const secondCallKey = cacheService.incr.mock.calls[1][0] as string;

      expect(firstCallKey).toBe(secondCallKey);
    });

    it('should produce a SHA256 hash in the key (64 hex chars)', async () => {
      cacheService.incr.mockResolvedValue(1);

      await service.check('user@example.com');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const key = cacheService.incr.mock.calls[0][0] as string;

      // Key format: ratelimit:{64-char-hex}:{bucket}
      expect(key).toMatch(/^ratelimit:[a-f0-9]{64}:\d+$/);
    });
  });

  // ==========================================================================
  // FAIL-OPEN BEHAVIOR
  // ==========================================================================

  describe('fail-open when Redis is unavailable', () => {
    it('should allow email when cache counter returns 0 (Redis down)', async () => {
      // ICacheCounter returns 0 on Redis connection failures
      cacheService.incr.mockResolvedValue(0);

      // Should NOT throw — fail-open behavior
      await expect(
        service.check('user@example.com'),
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
        customService.check('user@example.com'),
      ).resolves.toBeUndefined();

      // 6 should be rejected with limit of 5
      cacheService.incr.mockResolvedValue(6);
      await expect(
        customService.check('user@example.com'),
      ).rejects.toThrow(HttpException);
    });

    it('should respect custom EMAIL_RATE_LIMIT_WINDOW_SECONDS from config', async () => {
      const customService = await createService({
        EMAIL_RATE_LIMIT_WINDOW_SECONDS: 7200,
      });

      cacheService.incr.mockResolvedValue(1);
      await customService.check('user@example.com');

      expect(cacheService.incr).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ttl: 14400, // 2x the configured 7200s window
        }),
      );
    });
  });

  // ==========================================================================
  // REMAINING QUOTA
  // ==========================================================================

  describe('remaining', () => {
    it('should return full quota when no emails have been sent', async () => {
      cacheService.getCounter.mockResolvedValue(0);

      const remaining = await service.remaining('user@example.com');
      expect(remaining).toBe(10); // default max
    });

    it('should return correct remaining count after some sends', async () => {
      // First call = current bucket (7), second = previous bucket (0).
      cacheService.getCounter
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(0);

      const remaining = await service.remaining('user@example.com');
      expect(remaining).toBe(3);
    });

    it('should return 0 when quota is exhausted', async () => {
      cacheService.getCounter.mockResolvedValue(15);

      const remaining = await service.remaining('user@example.com');
      expect(remaining).toBe(0); // clamped to 0, not negative
    });
  });

  // ==========================================================================
  // SLIDING WINDOW — the boundary burst this algorithm exists to stop.
  //
  // Under the previous FIXED window, a sender could land `max` sends at
  // 11:59:59 and another full `max` at 12:00:00 — 2x the configured limit
  // inside two seconds, which is exactly the email-bombing pattern the control
  // is meant to prevent. The weighted two-bucket estimate carries the previous
  // bucket's usage across the boundary, decaying it as the window advances.
  // ==========================================================================

  describe('sliding window boundary', () => {
    /** Pin wall-clock to a chosen offset into the current window. */
    const atFractionOfWindow = (fraction: number, windowSeconds = 3600) => {
      const bucketStart = 1_000_000 * windowSeconds;
      jest
        .spyOn(Date, 'now')
        .mockReturnValue((bucketStart + fraction * windowSeconds) * 1000);
    };

    afterEach(() => jest.restoreAllMocks());

    it('REJECTS a fresh burst immediately after a full previous window', async () => {
      atFractionOfWindow(0.01); // just past the boundary
      cacheService.incr.mockResolvedValue(1); // 1 send in the new bucket
      cacheService.getCounter.mockResolvedValue(10); // previous bucket was full

      // estimate ≈ 1 + 10 * 0.99 = 10.9 > 10 → blocked.
      // The old fixed window saw only "1" here and let all 10 through again.
      await expect(service.check('user@example.com')).rejects.toThrow(
        HttpException,
      );
    });

    it('ALLOWS the same burst once the previous window has aged out', async () => {
      atFractionOfWindow(0.99); // almost a full window later
      cacheService.incr.mockResolvedValue(1);
      cacheService.getCounter.mockResolvedValue(10);

      // estimate ≈ 1 + 10 * 0.01 = 1.1 <= 10 → allowed.
      await expect(
        service.check('user@example.com'),
      ).resolves.toBeUndefined();
    });

    it('decays the previous bucket linearly across the window', async () => {
      // `remaining()` reads getCounter twice per call: current bucket, then
      // previous. Here the current bucket is empty and the previous was full.
      const emptyNowFullBefore = () =>
        cacheService.getCounter
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(10);

      atFractionOfWindow(0.5);
      emptyNowFullBefore();
      // estimate = 0 + 10 * 0.5 = 5 → floor(10 - 5) = 5
      expect(await service.remaining('user@example.com')).toBe(5);

      atFractionOfWindow(0.75);
      emptyNowFullBefore();
      // estimate = 0 + 10 * 0.25 = 2.5 → floor(10 - 2.5) = 7
      expect(await service.remaining('user@example.com')).toBe(7);
    });

    it('ignores an empty previous bucket rather than paying a second read', async () => {
      atFractionOfWindow(0.5);
      cacheService.incr.mockResolvedValue(3);
      cacheService.getCounter.mockResolvedValue(0);

      await expect(
        service.check('user@example.com'),
      ).resolves.toBeUndefined();
    });

    it('still fails open when Redis is down mid-window', async () => {
      atFractionOfWindow(0.5);
      cacheService.incr.mockResolvedValue(0); // Redis unavailable sentinel

      await expect(
        service.check('user@example.com'),
      ).resolves.toBeUndefined();
      // Must not even attempt the previous-bucket read on the fail-open path.
      expect(cacheService.getCounter).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  let service: RateLimitService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RateLimitService],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeWithRetry', () => {
    it('should execute function successfully', async () => {
      const result = await service.executeWithRetry(() =>
        Promise.resolve('success'),
      );
      expect(result).toBe('success');
    });

    it('should retry on failure and succeed', async () => {
      let attempts = 0;
      const result = await service.executeWithRetry(
        () => {
          attempts++;
          if (attempts < 2) {
            const error = new Error('Rate limited') as Error & {
              status: number;
            };
            error.status = 429;
            throw error;
          }
          return Promise.resolve('success');
        },
        { maxRetries: 3, initialDelayMs: 10 },
      );
      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });
  });

  describe('parseRateLimitHeaders', () => {
    it('should parse GitHub rate limit headers', () => {
      const headers: Record<string, string> = {
        'x-ratelimit-remaining': '10',
        'x-ratelimit-limit': '100',
        'x-ratelimit-reset': (Math.floor(Date.now() / 1000) + 60).toString(),
      };

      const result = service.parseRateLimitHeaders(headers);
      expect(result.remaining).toBe(10);
      expect(result.limit).toBe(100);
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should return nulls for missing headers', () => {
      const result = service.parseRateLimitHeaders({});
      expect(result.remaining).toBeNull();
      expect(result.limit).toBeNull();
      expect(result.resetAt).toBeNull();
    });
  });

  describe('shouldSlowDown', () => {
    it('should return true when approaching limit', () => {
      const headers: Record<string, string> = {
        'x-ratelimit-remaining': '5',
        'x-ratelimit-limit': '100',
      };

      const result = service.shouldSlowDown(headers, 0.1);
      expect(result).toBe(true);
    });

    it('should return false when not approaching limit', () => {
      const headers: Record<string, string> = {
        'x-ratelimit-remaining': '90',
        'x-ratelimit-limit': '100',
      };

      const result = service.shouldSlowDown(headers, 0.1);
      expect(result).toBe(false);
    });
  });
});

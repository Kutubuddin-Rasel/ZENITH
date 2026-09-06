import { Test, TestingModule } from '@nestjs/testing';
import {
  CACHE_COUNTER_TOKEN,
  CACHE_STORE_TOKEN,
} from '../../../cache/constants/cache.tokens';
import { CSRF_CONFIG_TOKEN } from '../constants/csrf.tokens';
import { CsrfRateLimiterService } from '../services/csrf-rate-limiter.service';

/**
 * Locks the penalty-box state machine. The atomic incr+expire pair and
 * the fail-open Redis semantics are security-critical and must be tested
 * end-to-end at the unit level.
 */
describe('CsrfRateLimiterService', () => {
  let service: CsrfRateLimiterService;
  const store = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
  };
  const counter = {
    incr: jest.fn(),
    decr: jest.fn(),
    incrWithRollingWindow: jest.fn(),
    getCounter: jest.fn(),
  };
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
        CsrfRateLimiterService,
        { provide: CACHE_STORE_TOKEN, useValue: store },
        { provide: CACHE_COUNTER_TOKEN, useValue: counter },
        { provide: CSRF_CONFIG_TOKEN, useValue: config },
      ],
    }).compile();
    service = module.get(CsrfRateLimiterService);
  });

  describe('isBanned', () => {
    it('returns true only when the ban key value is exactly "1"', async () => {
      store.get.mockResolvedValueOnce('1');
      await expect(service.isBanned('1.2.3.4')).resolves.toBe(true);
      expect(store.get).toHaveBeenCalledWith('csrf_ban:1.2.3.4');
    });

    it('returns false on missing ban key', async () => {
      store.get.mockResolvedValueOnce(null);
      await expect(service.isBanned('1.2.3.4')).resolves.toBe(false);
    });

    it('fails open (returns false) when Redis throws', async () => {
      store.get.mockRejectedValueOnce(new Error('redis down'));
      await expect(service.isBanned('1.2.3.4')).resolves.toBe(false);
    });
  });

  describe('recordFailure', () => {
    it('sets expire ONLY on the first failure (counter == 1)', async () => {
      counter.incr.mockResolvedValueOnce(1);
      const result = await service.recordFailure('1.2.3.4');
      expect(counter.incr).toHaveBeenCalledWith('csrf_fail:1.2.3.4');
      expect(store.expire).toHaveBeenCalledWith('csrf_fail:1.2.3.4', 300);
      expect(result).toEqual({ failureCount: 1, banTriggered: false });
    });

    it('does NOT re-set expire on subsequent failures below threshold', async () => {
      counter.incr.mockResolvedValueOnce(2);
      const result = await service.recordFailure('1.2.3.4');
      expect(store.expire).not.toHaveBeenCalled();
      expect(result).toEqual({ failureCount: 2, banTriggered: false });
    });

    it('triggers ban at threshold and writes ban key with banDuration TTL', async () => {
      counter.incr.mockResolvedValueOnce(10);
      store.set.mockResolvedValueOnce(true);
      const result = await service.recordFailure('1.2.3.4');
      expect(store.set).toHaveBeenCalledWith('csrf_ban:1.2.3.4', '1', {
        ttl: 300,
      });
      expect(result).toEqual({ failureCount: 10, banTriggered: true });
    });

    it('triggers ban on any failure past the threshold (idempotent)', async () => {
      counter.incr.mockResolvedValueOnce(11);
      store.set.mockResolvedValueOnce(true);
      const result = await service.recordFailure('1.2.3.4');
      expect(store.set).toHaveBeenCalledTimes(1);
      expect(result.banTriggered).toBe(true);
    });

    it('fails open with { 0, false } when incr throws', async () => {
      counter.incr.mockRejectedValueOnce(new Error('redis down'));
      await expect(service.recordFailure('1.2.3.4')).resolves.toEqual({
        failureCount: 0,
        banTriggered: false,
      });
    });

    it('returns banTriggered:false when ban write fails (degraded but not 429)', async () => {
      counter.incr.mockResolvedValueOnce(10);
      store.set.mockRejectedValueOnce(new Error('ban write failed'));
      const result = await service.recordFailure('1.2.3.4');
      expect(result.failureCount).toBe(10);
      expect(result.banTriggered).toBe(false);
    });
  });
});

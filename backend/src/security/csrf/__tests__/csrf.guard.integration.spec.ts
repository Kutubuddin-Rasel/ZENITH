import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CSRF_AUDITOR_TOKEN,
  CSRF_CONFIG_TOKEN,
  CSRF_RATE_LIMITER_TOKEN,
  CSRF_REQUEST_CONTEXT_TOKEN,
  CSRF_TOKEN_QUERY_TOKEN,
} from '../constants/csrf.tokens';
import { REQUIRE_CSRF_KEY, StatefulCsrfGuard } from '../guards/csrf.guard';
import { CsrfRequestSnapshot } from '../interfaces/csrf.interfaces';

/**
 * Integration spec for the slim orchestrator. The 4-port fakes here
 * stand in for the production services so we can exercise the ordering
 * invariant (bearer bypass → ban check → user → header → token) without
 * spinning up Redis.
 */

const SNAP_BASE: CsrfRequestSnapshot = {
  clientIp: '1.2.3.4',
  userId: 'user-42',
  csrfHeader: 'good-tok',
  isBearerAuth: false,
  path: '/api/x',
  method: 'POST',
  userAgent: 'jest',
};

const buildContext = (handlerMetadata: boolean): ExecutionContext => {
  const handler = (): void => {};
  const ctx = {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, path: '/api/x', method: 'POST' }),
    }),
  } as unknown as ExecutionContext;
  Reflect.defineMetadata(REQUIRE_CSRF_KEY, handlerMetadata, handler);
  return ctx;
};

describe('StatefulCsrfGuard — integration', () => {
  let guard: StatefulCsrfGuard;
  const requestContext = {
    extract: jest.fn<CsrfRequestSnapshot, [unknown]>(),
  };
  const tokenQuery = { validateToken: jest.fn() };
  const rateLimiter = { isBanned: jest.fn(), recordFailure: jest.fn() };
  const auditor = { logFailure: jest.fn(), logBanTriggered: jest.fn() };
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
        StatefulCsrfGuard,
        Reflector,
        { provide: CSRF_REQUEST_CONTEXT_TOKEN, useValue: requestContext },
        { provide: CSRF_TOKEN_QUERY_TOKEN, useValue: tokenQuery },
        { provide: CSRF_RATE_LIMITER_TOKEN, useValue: rateLimiter },
        { provide: CSRF_AUDITOR_TOKEN, useValue: auditor },
        { provide: CSRF_CONFIG_TOKEN, useValue: config },
      ],
    }).compile();
    guard = module.get(StatefulCsrfGuard);
  });

  describe('ordering invariant (Risk Flag #1)', () => {
    it('returns true unconditionally when handler has no @RequireCsrf()', async () => {
      await expect(guard.canActivate(buildContext(false))).resolves.toBe(true);
      expect(requestContext.extract).not.toHaveBeenCalled();
    });

    it('bypasses CSRF when Bearer auth detected — BEFORE the ban check', async () => {
      requestContext.extract.mockReturnValueOnce({
        ...SNAP_BASE,
        isBearerAuth: true,
      });
      await expect(guard.canActivate(buildContext(true))).resolves.toBe(true);
      // Bearer bypass MUST short-circuit before any cache call:
      expect(rateLimiter.isBanned).not.toHaveBeenCalled();
      expect(tokenQuery.validateToken).not.toHaveBeenCalled();
    });

    it('returns 429 when IP is banned — BEFORE any validation work', async () => {
      requestContext.extract.mockReturnValueOnce(SNAP_BASE);
      rateLimiter.isBanned.mockResolvedValueOnce(true);
      const error: unknown = await guard
        .canActivate(buildContext(true))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(tokenQuery.validateToken).not.toHaveBeenCalled();
    });
  });

  describe('fail-closed validation steps', () => {
    it('throws 403 + records failure when userId missing', async () => {
      requestContext.extract.mockReturnValueOnce({
        ...SNAP_BASE,
        userId: null,
      });
      rateLimiter.isBanned.mockResolvedValueOnce(false);
      rateLimiter.recordFailure.mockResolvedValueOnce({
        failureCount: 1,
        banTriggered: false,
      });
      await expect(
        guard.canActivate(buildContext(true)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(auditor.logFailure).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'user_context_missing' }),
      );
      expect(rateLimiter.recordFailure).toHaveBeenCalledWith('1.2.3.4');
    });

    it('throws 403 + records failure when CSRF header missing', async () => {
      requestContext.extract.mockReturnValueOnce({
        ...SNAP_BASE,
        csrfHeader: null,
      });
      rateLimiter.isBanned.mockResolvedValueOnce(false);
      rateLimiter.recordFailure.mockResolvedValueOnce({
        failureCount: 1,
        banTriggered: false,
      });
      await expect(
        guard.canActivate(buildContext(true)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(auditor.logFailure).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'header_token_missing' }),
      );
    });

    it('throws 403 + records failure when token validation returns false', async () => {
      requestContext.extract.mockReturnValueOnce(SNAP_BASE);
      rateLimiter.isBanned.mockResolvedValueOnce(false);
      tokenQuery.validateToken.mockResolvedValueOnce(false);
      rateLimiter.recordFailure.mockResolvedValueOnce({
        failureCount: 5,
        banTriggered: false,
      });
      await expect(
        guard.canActivate(buildContext(true)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(auditor.logFailure).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'token_expired_or_missing' }),
      );
    });

    it('logs ban-triggered event when recordFailure flips banTriggered', async () => {
      requestContext.extract.mockReturnValueOnce(SNAP_BASE);
      rateLimiter.isBanned.mockResolvedValueOnce(false);
      tokenQuery.validateToken.mockResolvedValueOnce(false);
      rateLimiter.recordFailure.mockResolvedValueOnce({
        failureCount: 10,
        banTriggered: true,
      });
      await expect(
        guard.canActivate(buildContext(true)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(auditor.logBanTriggered).toHaveBeenCalledWith('1.2.3.4', 10);
    });
  });

  describe('happy path', () => {
    it('returns true when token validates and IP is not banned', async () => {
      requestContext.extract.mockReturnValueOnce(SNAP_BASE);
      rateLimiter.isBanned.mockResolvedValueOnce(false);
      tokenQuery.validateToken.mockResolvedValueOnce(true);
      await expect(guard.canActivate(buildContext(true))).resolves.toBe(true);
      expect(auditor.logFailure).not.toHaveBeenCalled();
      expect(rateLimiter.recordFailure).not.toHaveBeenCalled();
    });
  });
});

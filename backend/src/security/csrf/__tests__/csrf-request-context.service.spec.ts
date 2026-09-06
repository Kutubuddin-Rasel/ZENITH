/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { CSRF_CONFIG_TOKEN } from '../constants/csrf.tokens';
import { ICsrfConfig } from '../interfaces/csrf.interfaces';
import { ExpressCsrfRequestContext } from '../services/express-csrf-request-context.service';

const fakeConfig: ICsrfConfig = {
  tokenTtlSeconds: 3600,
  failureThreshold: 10,
  failureWindowSeconds: 300,
  banDurationSeconds: 300,
  headerName: 'X-CSRF-Token',
  cookieName: 'csrf_token',
};

const buildRequest = (overrides: Partial<Request>): Request => {
  return {
    headers: {},
    path: '/some/path',
    method: 'POST',
    socket: {} as Request['socket'],
    ip: '',
    ...overrides,
  } as Request;
};

describe('ExpressCsrfRequestContext', () => {
  let ctx: ExpressCsrfRequestContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpressCsrfRequestContext,
        { provide: CSRF_CONFIG_TOKEN, useValue: fakeConfig },
      ],
    }).compile();
    ctx = module.get(ExpressCsrfRequestContext);
  });

  describe('clientIp resolution', () => {
    it('uses first entry of x-forwarded-for array', () => {
      const snap = ctx.extract(
        buildRequest({
          headers: { 'x-forwarded-for': ['203.0.113.4', '10.0.0.1'] },
        }),
      );
      expect(snap.clientIp).toBe('203.0.113.4');
    });

    it('parses x-forwarded-for comma-list and trims whitespace', () => {
      const snap = ctx.extract(
        buildRequest({
          headers: { 'x-forwarded-for': '  198.51.100.7 ,  10.0.0.2' },
        }),
      );
      expect(snap.clientIp).toBe('198.51.100.7');
    });

    it('falls back to socket.remoteAddress when no XFF header', () => {
      const snap = ctx.extract(
        buildRequest({
          socket: { remoteAddress: '127.0.0.1' } as Request['socket'],
        }),
      );
      expect(snap.clientIp).toBe('127.0.0.1');
    });

    it('falls back to "unknown" when no IP source available', () => {
      const snap = ctx.extract(buildRequest({}));
      expect(snap.clientIp).toBe('unknown');
    });
  });

  describe('userId fallback chain (userId → id → sub)', () => {
    it('prefers userId', () => {
      const snap = ctx.extract(
        buildRequest({
          user: { userId: 'A', id: 'B', sub: 'C' } as any,
        }),
      );
      expect(snap.userId).toBe('A');
    });

    it('falls back to id when userId absent', () => {
      const snap = ctx.extract(
        buildRequest({
          user: { id: 'B', sub: 'C' } as any,
        }),
      );
      expect(snap.userId).toBe('B');
    });

    it('falls back to sub when userId+id absent', () => {
      const snap = ctx.extract(
        buildRequest({
          user: { sub: 'C' } as any,
        }),
      );
      expect(snap.userId).toBe('C');
    });

    it('returns null when no user attached', () => {
      const snap = ctx.extract(buildRequest({}));
      expect(snap.userId).toBeNull();
    });
  });

  describe('csrfHeader read', () => {
    it('reads case-insensitively via configured headerName', () => {
      const snap = ctx.extract(
        buildRequest({ headers: { 'x-csrf-token': 'tok-123' } }),
      );
      expect(snap.csrfHeader).toBe('tok-123');
    });
  });

  describe('isBearerAuth flag', () => {
    it('returns true when Authorization starts with "Bearer "', () => {
      const snap = ctx.extract(
        buildRequest({ headers: { authorization: 'Bearer abc.def.ghi' } }),
      );
      expect(snap.isBearerAuth).toBe(true);
    });

    it('returns false for cookie-only auth', () => {
      const snap = ctx.extract(buildRequest({}));
      expect(snap.isBearerAuth).toBe(false);
    });

    it('returns false for non-Bearer scheme', () => {
      const snap = ctx.extract(
        buildRequest({ headers: { authorization: 'Basic abcd' } }),
      );
      expect(snap.isBearerAuth).toBe(false);
    });
  });
});

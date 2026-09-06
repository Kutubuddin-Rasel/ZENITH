import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CsrfConfigService } from '../config/csrf-config.service';

/**
 * Verifies the frontend contract defaults (csrf_token / X-CSRF-Token /
 * 3600s TTL) and the env-override surface. These defaults are the shipped
 * browser API — regressions here would silently break every Next.js
 * client.
 */
describe('CsrfConfigService', () => {
  const buildService = async (
    envOverrides: Record<string, string | number | undefined>,
  ): Promise<CsrfConfigService> => {
    const mockConfig: Pick<ConfigService, 'get'> = {
      get: jest.fn((key: string) => envOverrides[key]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsrfConfigService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    return module.get(CsrfConfigService);
  };

  it('applies frontend-contract defaults when env unset', async () => {
    const service = await buildService({});
    expect(service.tokenTtlSeconds).toBe(3600);
    expect(service.failureThreshold).toBe(10);
    expect(service.failureWindowSeconds).toBe(300);
    expect(service.banDurationSeconds).toBe(300);
    expect(service.headerName).toBe('X-CSRF-Token');
    expect(service.cookieName).toBe('csrf_token');
  });

  it('honors env overrides for self-hosted deployments', async () => {
    const service = await buildService({
      CSRF_TOKEN_TTL_SECONDS: 7200,
      CSRF_FAILURE_THRESHOLD: 5,
      CSRF_FAILURE_WINDOW_SECONDS: 60,
      CSRF_BAN_DURATION_SECONDS: 900,
      CSRF_HEADER_NAME: 'X-Zenith-CSRF',
      CSRF_COOKIE_NAME: 'zen_csrf',
    });
    expect(service.tokenTtlSeconds).toBe(7200);
    expect(service.failureThreshold).toBe(5);
    expect(service.failureWindowSeconds).toBe(60);
    expect(service.banDurationSeconds).toBe(900);
    expect(service.headerName).toBe('X-Zenith-CSRF');
    expect(service.cookieName).toBe('zen_csrf');
  });
});

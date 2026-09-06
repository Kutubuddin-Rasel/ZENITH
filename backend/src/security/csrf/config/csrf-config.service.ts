import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ICsrfConfig } from '../interfaces/csrf.interfaces';

/**
 * Operational tuning surface for the CSRF guard + service stack.
 *
 * FRONTEND CONTRACT (immutable defaults):
 *  - `headerName: 'X-CSRF-Token'` and `cookieName: 'csrf_token'` are the
 *    names the Next.js client (`frontend/src/lib/csrf.ts`) writes and
 *    reads. Env overrides exist for self-host deployments that need to
 *    rename the surface, but production deploys MUST leave the defaults.
 *  - `tokenTtlSeconds: 3600` matches the multi-tab reuse window the
 *    frontend assumes when deciding whether to call `/auth/csrf-token`.
 *
 * RATE-LIMIT TUNING (security policy defaults from legacy guard):
 *  - 10 failures within 300s → 300s soft ban.
 *  - Lower threshold would block multi-tab race conditions on token
 *    expiry; higher would let attackers brute-force longer.
 */
@Injectable()
export class CsrfConfigService implements ICsrfConfig {
  readonly tokenTtlSeconds: number;
  readonly failureThreshold: number;
  readonly failureWindowSeconds: number;
  readonly banDurationSeconds: number;
  readonly headerName: string;
  readonly cookieName: string;

  constructor(config: ConfigService) {
    this.tokenTtlSeconds = config.get<number>('CSRF_TOKEN_TTL_SECONDS') ?? 3600;
    this.failureThreshold = config.get<number>('CSRF_FAILURE_THRESHOLD') ?? 10;
    this.failureWindowSeconds =
      config.get<number>('CSRF_FAILURE_WINDOW_SECONDS') ?? 300;
    this.banDurationSeconds =
      config.get<number>('CSRF_BAN_DURATION_SECONDS') ?? 300;
    this.headerName = config.get<string>('CSRF_HEADER_NAME') ?? 'X-CSRF-Token';
    this.cookieName = config.get<string>('CSRF_COOKIE_NAME') ?? 'csrf_token';
  }
}

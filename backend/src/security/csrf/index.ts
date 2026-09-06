/**
 * CSRF Module — Sealed Public Barrel (Step 3 of SOLID refactor).
 *
 * THE ONLY supported import surface for external consumers. Reaching past
 * this barrel into `csrf.module`, `guards/csrf.guard`, or any service /
 * repository file is a SOLID violation — it leaks internals and locks
 * future refactors out of the implementation details.
 *
 * EXPOSED:
 *  - `CsrfModule` — for AppModule + any feature module needing CSRF.
 *  - `StatefulCsrfGuard` (+ `CsrfGuard` deprecated alias) and
 *    `RequireCsrf` decorator / `REQUIRE_CSRF_KEY` metadata key — the
 *    handler-level CSRF activation surface.
 *  - All 7 Symbol DI tokens — for advanced consumers that need to
 *    customize or stub a port in their own test setup.
 *  - All 7 abstract port classes — usable as TypeScript types AND DI
 *    tokens (NestJS DIP seam).
 *  - Public value types (`CsrfFailureReason`, `CsrfFailureContext`,
 *    `CsrfRequestSnapshot`, `CsrfFailureRecord`).
 *
 * HIDDEN (intentionally):
 *  - All concrete services, repositories, config impl, controller.
 *  - The legacy `csrf.guard.ts` re-export shim (deleted in Step 3).
 *  - The `csrf.service.ts` god-class (deleted in Step 2).
 */

export { CsrfModule } from './csrf.module';

export {
  CsrfGuard,
  REQUIRE_CSRF_KEY,
  RequireCsrf,
  StatefulCsrfGuard,
} from './guards/csrf.guard';

export {
  CSRF_AUDITOR_TOKEN,
  CSRF_CONFIG_TOKEN,
  CSRF_RATE_LIMITER_TOKEN,
  CSRF_REQUEST_CONTEXT_TOKEN,
  CSRF_TOKEN_COMMAND_TOKEN,
  CSRF_TOKEN_QUERY_TOKEN,
  CSRF_TOKEN_REPOSITORY_TOKEN,
} from './constants/csrf.tokens';

export {
  ICsrfAuditor,
  ICsrfConfig,
  ICsrfRateLimiter,
  ICsrfRequestContext,
  ICsrfTokenCommand,
  ICsrfTokenQuery,
  ICsrfTokenRepository,
} from './interfaces/csrf.interfaces';

export type {
  CsrfFailureContext,
  CsrfFailureReason,
  CsrfFailureRecord,
  CsrfRequestSnapshot,
} from './interfaces/csrf.interfaces';

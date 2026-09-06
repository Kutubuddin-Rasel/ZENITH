/**
 * CSRF Module — ISP Contract Layer (Step 1 of SOLID refactor).
 *
 * Segregates the 363-line `StatefulCsrfGuard` god class and the 141-line
 * `CsrfService` into seven role-based ports. Each abstract class below is
 * a NestJS DIP seam (used as both type AND token-equivalent surface)
 * bound through the symbol tokens declared in
 * `../constants/csrf.tokens.ts`. Step-2 services will each implement
 * exactly one of these ports; the Step-3 slim guard (~110 LOC) will
 * inject only the orchestration ports it actually needs — no more god-
 * surface coupling, no more direct `node:crypto` / `AuditService` /
 * `ICacheStore` references inside the guard.
 *
 * Value types are declared here so the contract layer owns the canonical
 * public shape — the concrete `CsrfService` will be deleted at the end of
 * Step 2.
 *
 * RISK FLAGS preserved at the contract level (see plan §Risk Flags):
 *  - `recordFailure` and `isBanned` are documented fail-open on Redis
 *    error: availability > strict enforcement during cache outage.
 *  - `recordFailure` MUST keep the `incr` + `expire` pair atomic in a
 *    single port method to avoid immortal counters on Redis crash.
 *  - Audit events are `organizationId: SYSTEM_TENANT_ID` — CSRF is a
 *    system-scoped security concern, not tenant-scoped.
 */

import type { Request } from 'express';

// ============================================================================
// VALUE TYPES (canonical public shapes)
// ============================================================================

/**
 * Reason a stateful CSRF check rejected a request. Composed by the slim
 * guard, recorded by both `ICsrfAuditor` and `ICsrfRateLimiter`.
 */
export type CsrfFailureReason =
  | 'user_context_missing'
  | 'header_token_missing'
  | 'token_expired_or_missing'
  | 'token_invalid'
  | 'ip_rate_limited';

/**
 * Forensic context attached to every CSRF failure. Mirrors the legacy
 * `logCsrfFailure` payload so the audit trail stays byte-compatible.
 */
export interface CsrfFailureContext {
  reason: CsrfFailureReason;
  clientIp: string;
  userId?: string | null;
  path: string;
  method: string;
  userAgent?: string;
  hasHeaderToken: boolean;
  isAuthenticated: boolean;
}

/**
 * Per-request HTTP extraction snapshot produced by
 * `ICsrfRequestContext.extract`. Decouples the guard from `express.Request`
 * shape so the orchestration can be unit-tested without an Express fake.
 */
export interface CsrfRequestSnapshot {
  clientIp: string;
  userId: string | null;
  csrfHeader: string | null;
  isBearerAuth: boolean;
  path: string;
  method: string;
  userAgent: string;
}

/**
 * Outcome of `ICsrfRateLimiter.recordFailure`. Lets the guard log the
 * post-increment counter without re-querying Redis.
 */
export interface CsrfFailureRecord {
  failureCount: number;
  banTriggered: boolean;
}

// ============================================================================
// ROLE-BASED PORTS (one abstract class per responsibility)
// ============================================================================

/**
 * CQRS write surface for CSRF token lifecycle.
 * Bound via `CSRF_TOKEN_COMMAND_TOKEN`.
 *
 * `generateToken` is multi-tab safe — repeat calls within TTL return the
 * existing token with TTL refreshed (defense-in-depth: rejects empty /
 * whitespace userId even if upstream auth guard is removed).
 */
export abstract class ICsrfTokenCommand {
  abstract generateToken(userId: string): Promise<string>;
  abstract invalidateToken(userId: string): Promise<void>;
}

/**
 * CQRS read surface for CSRF token verification.
 * Bound via `CSRF_TOKEN_QUERY_TOKEN`.
 *
 * Fail-closed on any missing / malformed input. Implementation uses the
 * `Hasher.timingSafeEqual` port to defeat timing-attack side channels.
 */
export abstract class ICsrfTokenQuery {
  abstract validateToken(
    userId: string,
    providedToken: string,
  ): Promise<boolean>;
}

/**
 * Persistence boundary for CSRF tokens. Owns the `csrf:<userId>` key
 * schema and TTL semantics. Bound via `CSRF_TOKEN_REPOSITORY_TOKEN`.
 */
export abstract class ICsrfTokenRepository {
  abstract get(userId: string): Promise<string | null>;
  abstract set(
    userId: string,
    token: string,
    ttlSeconds: number,
  ): Promise<void>;
  abstract delete(userId: string): Promise<void>;
}

/**
 * Penalty-box rate limiter for repeat CSRF failures.
 * Bound via `CSRF_RATE_LIMITER_TOKEN`.
 *
 * `recordFailure` keeps `incr` + `expire` atomic in a single method —
 * splitting the pair across services would let a Redis crash between
 * calls leave an immortal counter. Both methods are fail-open on Redis
 * error: cache outages must NOT degrade legitimate traffic to 429.
 */
export abstract class ICsrfRateLimiter {
  abstract isBanned(clientIp: string): Promise<boolean>;
  abstract recordFailure(clientIp: string): Promise<CsrfFailureRecord>;
}

/**
 * Adapter port wrapping `AuditService` for CSRF security events.
 * Bound via `CSRF_AUDITOR_TOKEN`. The Step-2 implementation
 * (`CsrfAuditService`) is the ONLY service in this module permitted to
 * inject the concrete `AuditService` directly.
 *
 * Events are written with `organizationId: SYSTEM_TENANT_ID` — CSRF is a
 * system-scoped concern, not tenant-scoped.
 */
export abstract class ICsrfAuditor {
  abstract logFailure(context: CsrfFailureContext): Promise<void>;
  abstract logBanTriggered(
    clientIp: string,
    failureCount: number,
  ): Promise<void>;
}

/**
 * Pure HTTP-extraction surface. Decouples the guard from
 * `express.Request` shape so orchestration can be unit-tested without an
 * Express fake. Bound via `CSRF_REQUEST_CONTEXT_TOKEN`.
 *
 * `extract` resolves clientIp (`x-forwarded-for` chain, then socket),
 * userId (`userId` → `id` → `sub` fallback to match the legacy guard),
 * csrfHeader (`X-CSRF-Token`, config-driven), and `isBearerAuth` flag for
 * the API-key bypass.
 */
export abstract class ICsrfRequestContext {
  abstract extract(request: Request): CsrfRequestSnapshot;
}

/**
 * Operational tuning surface for CSRF guard + services. Bound via
 * `CSRF_CONFIG_TOKEN`. Implementation reads from `ConfigService` once at
 * construction; the frontend contract values (`csrf_token` cookie,
 * `X-CSRF-Token` header, `tokenTtlSeconds: 3600`) MUST remain the
 * defaults — they are part of the shipped browser API.
 */
export abstract class ICsrfConfig {
  abstract readonly tokenTtlSeconds: number;
  abstract readonly failureThreshold: number;
  abstract readonly failureWindowSeconds: number;
  abstract readonly banDurationSeconds: number;
  abstract readonly headerName: string;
  abstract readonly cookieName: string;
}

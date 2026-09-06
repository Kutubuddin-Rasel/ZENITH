import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  CSRF_AUDITOR_TOKEN,
  CSRF_CONFIG_TOKEN,
  CSRF_RATE_LIMITER_TOKEN,
  CSRF_REQUEST_CONTEXT_TOKEN,
  CSRF_TOKEN_QUERY_TOKEN,
} from '../constants/csrf.tokens';
import {
  CsrfFailureContext,
  CsrfFailureReason,
  CsrfRequestSnapshot,
  ICsrfAuditor,
  ICsrfConfig,
  ICsrfRateLimiter,
  ICsrfRequestContext,
  ICsrfTokenQuery,
} from '../interfaces/csrf.interfaces';

export const REQUIRE_CSRF_KEY = 'require_csrf';

/**
 * Decorator to require CSRF validation on a specific handler.
 * Use with `StatefulCsrfGuard` at controller level.
 */
export const RequireCsrf = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_CSRF_KEY, true);

/**
 * Stateful CSRF Guard — slim orchestrator over five role-segregated
 * ports. Mandatory on password change, 2FA, account deletion, session
 * revocation, payment, and any state-changing operation that mutates
 * security-relevant state.
 *
 * ORDERING INVARIANT (Risk Flag #1 — preserve exactly):
 *  1. Reflector check          — skip if `@RequireCsrf()` not present.
 *  2. Bearer-auth bypass       — API-key callers don't ride a cookie,
 *                                so CSRF doesn't apply. MUST run before
 *                                the ban check, otherwise banned IPs
 *                                lose API-key access too.
 *  3. Ban check                — banned IPs get 429 before any
 *                                validation work.
 *  4. User-context / header /
 *     token validation         — fail-closed; each failure recorded by
 *                                auditor + rate-limiter.
 *
 * Zero `node:crypto`, `AuditService`, `ICacheStore`, or `ICacheCounter`
 * imports — every concern is behind a port.
 */
@Injectable()
export class StatefulCsrfGuard implements CanActivate {
  private readonly logger = new Logger(StatefulCsrfGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(CSRF_REQUEST_CONTEXT_TOKEN)
    private readonly requestContext: ICsrfRequestContext,
    @Inject(CSRF_TOKEN_QUERY_TOKEN)
    private readonly tokenQuery: ICsrfTokenQuery,
    @Inject(CSRF_RATE_LIMITER_TOKEN)
    private readonly rateLimiter: ICsrfRateLimiter,
    @Inject(CSRF_AUDITOR_TOKEN) private readonly auditor: ICsrfAuditor,
    @Inject(CSRF_CONFIG_TOKEN) private readonly config: ICsrfConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireCsrf = this.reflector.get<boolean>(
      REQUIRE_CSRF_KEY,
      context.getHandler(),
    );
    if (!requireCsrf) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const snapshot = this.requestContext.extract(request);

    // STEP 1: Bearer bypass (must precede ban check — Risk Flag #1).
    if (snapshot.isBearerAuth) {
      this.logger.debug('CSRF bypassed: Bearer token authentication detected');
      return true;
    }

    // STEP 2: Ban check (cheap; saves validation CPU on hostile IPs).
    if (await this.rateLimiter.isBanned(snapshot.clientIp)) {
      this.logger.warn(
        `CSRF BANNED IP: ${snapshot.clientIp} - Dropping request`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many CSRF failures. Please wait and try again.',
          error: 'Too Many Requests',
          retryAfter: this.config.banDurationSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // STEP 3: User context required.
    if (!snapshot.userId) {
      await this.handleFailure(snapshot, 'user_context_missing');
      throw new ForbiddenException(
        'Authentication required for CSRF validation',
      );
    }

    // STEP 4: Header token required.
    if (!snapshot.csrfHeader) {
      await this.handleFailure(snapshot, 'header_token_missing');
      throw new ForbiddenException('CSRF token header required');
    }

    // STEP 5: Token validation (timing-safe).
    const valid = await this.tokenQuery.validateToken(
      snapshot.userId,
      snapshot.csrfHeader,
    );
    if (!valid) {
      await this.handleFailure(snapshot, 'token_expired_or_missing');
      throw new ForbiddenException('Invalid or expired CSRF token');
    }

    return true;
  }

  private async handleFailure(
    snapshot: CsrfRequestSnapshot,
    reason: CsrfFailureReason,
  ): Promise<void> {
    const failureContext: CsrfFailureContext = {
      reason,
      clientIp: snapshot.clientIp,
      userId: snapshot.userId,
      path: snapshot.path,
      method: snapshot.method,
      userAgent: snapshot.userAgent,
      hasHeaderToken: snapshot.csrfHeader !== null,
      isAuthenticated: snapshot.userId !== null,
    };

    await this.auditor.logFailure(failureContext);

    const record = await this.rateLimiter.recordFailure(snapshot.clientIp);
    if (record.banTriggered) {
      await this.auditor.logBanTriggered(
        snapshot.clientIp,
        record.failureCount,
      );
    }
  }
}

/**
 * @deprecated Use StatefulCsrfGuard instead. Alias preserved for the
 * three external consumers that already imported `CsrfGuard`.
 */
export { StatefulCsrfGuard as CsrfGuard };

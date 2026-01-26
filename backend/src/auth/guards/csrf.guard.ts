import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { CookieService } from '../services/cookie.service';
import { AuditService } from '../../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../../audit/entities/audit-log.entity';
import { CacheService } from '../../cache/cache.service';

// ============================================================================
// CSRF RATE LIMITING CONFIGURATION
// ============================================================================

/**
 * Penalty Box Configuration
 *
 * SECURITY RATIONALE:
 * - 10 failures in 5 minutes is abnormal behavior
 * - Legitimate users rarely fail CSRF more than once (page refresh usually fixes)
 * - 5-minute ban is long enough to frustrate attackers, short enough for legitimate recovery
 */
const CSRF_RATE_LIMIT = {
  /** Max failures before soft ban */
  FAILURE_THRESHOLD: 10,
  /** TTL for failure counter (seconds) */
  FAILURE_WINDOW_TTL: 300, // 5 minutes
  /** Duration of soft ban (seconds) */
  BAN_DURATION_TTL: 300, // 5 minutes
  /** Redis key prefix for failure counter */
  FAILURE_KEY_PREFIX: 'csrf_fail:',
  /** Redis key prefix for ban flag */
  BAN_KEY_PREFIX: 'csrf_ban:',
} as const;

// ============================================================================
// FAILURE REASONS
// ============================================================================

enum CsrfFailureReason {
  HEADER_MISSING = 'header_token_missing',
  COOKIE_MISSING = 'cookie_token_missing',
  TOKEN_MISMATCH = 'token_mismatch',
  IP_BANNED = 'ip_rate_limited',
}

// ============================================================================
// STATELESS CSRF GUARD (Double-Submit Cookie Pattern)
// ============================================================================

/**
 * ============================================================================
 * STATELESS CSRF GUARD (Double-Submit Cookie Pattern)
 * ============================================================================
 *
 * USE THIS GUARD FOR:
 * - General cookie-authenticated endpoints
 * - Token refresh operations
 * - Session validation
 *
 * DO NOT USE FOR:
 * - Password changes (use StatefulCsrfGuard)
 * - 2FA operations (use StatefulCsrfGuard)
 * - Account deletion (use StatefulCsrfGuard)
 *
 * RATE LIMITING (Penalty Box):
 * - Tracks CSRF failures per IP in Redis
 * - 10 failures in 5 minutes → 5-minute soft ban
 * - Banned IPs get 429 immediately (before validation)
 *
 * @see StatefulCsrfGuard for high-security operations
 */
@Injectable()
export class StatelessCsrfGuard implements CanActivate {
  private readonly logger = new Logger(StatelessCsrfGuard.name);

  constructor(
    private readonly cookieService: CookieService,
    private readonly auditService: AuditService,
    private readonly cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.extractClientIp(request);

    // =========================================================================
    // STEP 1: CHECK BAN (Before any validation - save CPU)
    // =========================================================================
    const isBanned = await this.checkBan(clientIp);
    if (isBanned) {
      this.logger.warn(`CSRF BANNED IP: ${clientIp} - Dropping request`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many CSRF failures. Please wait and try again.',
          error: 'Too Many Requests',
          retryAfter: CSRF_RATE_LIMIT.BAN_DURATION_TTL,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // =========================================================================
    // STEP 2: CSRF VALIDATION
    // =========================================================================
    const headerToken = this.cookieService.extractCsrfTokenFromHeader(request);
    const cookieToken = this.cookieService.extractCsrfTokenFromCookie(request);

    let failureReason: CsrfFailureReason | null = null;

    if (!headerToken) {
      failureReason = CsrfFailureReason.HEADER_MISSING;
    } else if (!cookieToken) {
      failureReason = CsrfFailureReason.COOKIE_MISSING;
    } else {
      const isValid = this.cookieService.validateCsrfToken(request);
      if (!isValid) {
        failureReason = CsrfFailureReason.TOKEN_MISMATCH;
      }
    }

    // =========================================================================
    // STEP 3: HANDLE FAILURE (Increment counter, possibly ban)
    // =========================================================================
    if (failureReason) {
      await this.handleFailure(request, clientIp, failureReason);
      throw new ForbiddenException(
        'CSRF token validation failed. Please refresh and try again.',
      );
    }

    return true;
  }

  /**
   * Check if IP is currently banned
   */
  private async checkBan(clientIp: string): Promise<boolean> {
    try {
      const banKey = `${CSRF_RATE_LIMIT.BAN_KEY_PREFIX}${clientIp}`;
      const banned = await this.cacheService.get<string>(banKey);
      return banned === '1';
    } catch (error) {
      // Fail-open on Redis error (don't block legitimate users)
      this.logger.error('Redis error checking CSRF ban', error);
      return false;
    }
  }

  /**
   * Handle CSRF validation failure:
   * 1. Log the failure
   * 2. Increment failure counter
   * 3. Trigger ban if threshold reached
   */
  private async handleFailure(
    request: Request,
    clientIp: string,
    reason: CsrfFailureReason,
  ): Promise<void> {
    // Log to audit (existing Phase 2 logic)
    await this.logCsrfFailure(request, reason);

    // Increment failure counter
    try {
      const failKey = `${CSRF_RATE_LIMIT.FAILURE_KEY_PREFIX}${clientIp}`;

      // INCR and get current count
      const currentCount = await this.cacheService.incr(failKey);

      // Set TTL on first failure (INCR returns 1 on new key)
      if (currentCount === 1) {
        await this.cacheService.expire(
          failKey,
          CSRF_RATE_LIMIT.FAILURE_WINDOW_TTL,
        );
      }

      // Check threshold
      if (currentCount >= CSRF_RATE_LIMIT.FAILURE_THRESHOLD) {
        await this.triggerBan(clientIp, currentCount);
      }

      this.logger.debug(
        `CSRF failure count for ${clientIp}: ${currentCount}/${CSRF_RATE_LIMIT.FAILURE_THRESHOLD}`,
      );
    } catch (error) {
      // Fail-open on Redis error
      this.logger.error('Redis error tracking CSRF failure', error);
    }
  }

  /**
   * Trigger soft ban for IP
   */
  private async triggerBan(
    clientIp: string,
    failureCount: number,
  ): Promise<void> {
    try {
      const banKey = `${CSRF_RATE_LIMIT.BAN_KEY_PREFIX}${clientIp}`;
      await this.cacheService.set(banKey, '1', {
        ttl: CSRF_RATE_LIMIT.BAN_DURATION_TTL,
      });

      this.logger.warn(
        `CSRF BAN TRIGGERED: ${clientIp} after ${failureCount} failures. Banned for ${CSRF_RATE_LIMIT.BAN_DURATION_TTL}s`,
      );

      // Log ban event
      await this.auditService.log({
        eventType: AuditEventType.CSRF_VALIDATION_FAILED,
        severity: AuditSeverity.HIGH,
        description: `CSRF rate limit ban triggered after ${failureCount} failures`,
        ipAddress: clientIp,
        resourceType: 'csrf',
        details: {
          failureReason: 'rate_limit_ban_triggered',
          failureCount,
          banDurationSeconds: CSRF_RATE_LIMIT.BAN_DURATION_TTL,
          guardType: 'stateless',
        },
      });
    } catch (error) {
      this.logger.error('Failed to set CSRF ban', error);
    }
  }

  /**
   * Log CSRF validation failure with forensic details.
   */
  private async logCsrfFailure(
    request: Request,
    reason: CsrfFailureReason,
  ): Promise<void> {
    const userId = this.extractUserIdSafely(request);
    const isAuthenticated = userId !== 'anonymous';
    const path = request.path || request.url;
    const method = request.method;
    const ipAddress = this.extractClientIp(request);
    const userAgent = request.headers['user-agent'] || 'unknown';

    try {
      await this.auditService.log({
        eventType: AuditEventType.CSRF_VALIDATION_FAILED,
        severity: AuditSeverity.HIGH,
        description: `Stateless CSRF validation failed: ${reason}`,
        userId: isAuthenticated ? userId : undefined,
        ipAddress,
        userAgent,
        resourceType: 'csrf',
        details: {
          failureReason: reason,
          guardType: 'stateless',
          path,
          method,
          isAuthenticated,
          hasHeaderToken: !!request.headers['x-csrf-token'],
          hasCookieToken: !!request.cookies?.csrf_token,
        },
      });
    } catch (error) {
      this.logger.error('Failed to log CSRF_VALIDATION_FAILED event', error);
    }

    this.logger.warn(
      `CSRF BLOCKED (Stateless): ${reason} | ${method} ${path} | IP: ${ipAddress} | User: ${userId}`,
    );
  }

  private extractUserIdSafely(request: Request): string {
    // Define expected user properties for type safety
    interface RequestWithUser extends Request {
      user?: {
        userId?: string;
        id?: string;
        sub?: string;
      };
    }
    const typedRequest = request as RequestWithUser;
    return (
      typedRequest.user?.userId ||
      typedRequest.user?.id ||
      typedRequest.user?.sub ||
      'anonymous'
    );
  }

  private extractClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(',')[0];
      return ips.trim();
    }
    return request.socket?.remoteAddress || request.ip || 'unknown';
  }
}

// ============================================================================
// BACKWARD COMPATIBILITY ALIAS
// ============================================================================
/**
 * @deprecated Use StatelessCsrfGuard instead
 */
export { StatelessCsrfGuard as CsrfGuard };

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  SetMetadata,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CsrfService } from './csrf.service';
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
 * - Legitimate users rarely fail CSRF more than once
 * - 5-minute ban frustrates attackers while allowing legitimate recovery
 */
const CSRF_RATE_LIMIT = {
  FAILURE_THRESHOLD: 10,
  FAILURE_WINDOW_TTL: 300, // 5 minutes
  BAN_DURATION_TTL: 300, // 5 minutes
  FAILURE_KEY_PREFIX: 'csrf_fail:',
  BAN_KEY_PREFIX: 'csrf_ban:',
} as const;

// ============================================================================
// DECORATOR
// ============================================================================

export const REQUIRE_CSRF_KEY = 'require_csrf';

/**
 * Decorator to require CSRF validation on a specific handler.
 * Use with StatefulCsrfGuard at controller level.
 */
export const RequireCsrf = () => SetMetadata(REQUIRE_CSRF_KEY, true);

// ============================================================================
// FAILURE REASONS
// ============================================================================

enum StatefulCsrfFailureReason {
  USER_CONTEXT_MISSING = 'user_context_missing',
  HEADER_MISSING = 'header_token_missing',
  TOKEN_EXPIRED = 'token_expired_or_missing',
  TOKEN_INVALID = 'token_invalid',
  IP_BANNED = 'ip_rate_limited',
}

// ============================================================================
// STATEFUL CSRF GUARD (Redis-Backed Token Validation)
// ============================================================================

/**
 * ============================================================================
 * STATEFUL CSRF GUARD (Redis-Backed Token Validation)
 * ============================================================================
 *
 * USE THIS GUARD FOR (MANDATORY):
 * - Password change operations
 * - 2FA enable/disable operations
 * - Account deletion
 * - Session revocation
 * - Payment/financial operations
 *
 * RATE LIMITING (Penalty Box):
 * - Tracks CSRF failures per IP in Redis
 * - 10 failures in 5 minutes → 5-minute soft ban
 * - Banned IPs get 429 immediately (before validation)
 * - Ban check runs FIRST to save CPU cycles
 *
 * ACTIVATION:
 * Apply guard at controller level, use @RequireCsrf() on specific handlers.
 *
 * @see StatelessCsrfGuard for general/low-risk endpoints
 */
@Injectable()
export class StatefulCsrfGuard implements CanActivate {
  private readonly logger = new Logger(StatefulCsrfGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly csrfService: CsrfService,
    private readonly auditService: AuditService,
    private readonly cacheService: CacheService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if CSRF validation is required for this handler
    const requireCsrf = this.reflector.get<boolean>(
      REQUIRE_CSRF_KEY,
      context.getHandler(),
    );

    if (!requireCsrf) {
      return true; // CSRF not required for this handler
    }

    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.extractClientIp(request);

    // =========================================================================
    // STEP 0: BEARER TOKEN BYPASS (CI/CD Support)
    // =========================================================================
    // If request is authenticated via Bearer token (API key), skip CSRF.
    // Rationale: CSRF attacks exploit browser cookies. Bearer tokens are
    // intentionally included in requests, so machine-to-machine calls
    // (CI/CD pipelines) don't need CSRF protection.
    const authHeader = request.headers['authorization'] as string;
    if (authHeader?.startsWith('Bearer ')) {
      this.logger.debug('CSRF bypassed: Bearer token authentication detected');
      return true;
    }

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
    const userId = this.extractUserIdSafely(request);
    const isAuthenticated = userId !== null;

    // Check 1: User context required
    if (!isAuthenticated) {
      await this.handleFailure(
        request,
        clientIp,
        StatefulCsrfFailureReason.USER_CONTEXT_MISSING,
        null,
      );
      throw new ForbiddenException(
        'Authentication required for CSRF validation',
      );
    }

    // Check 2: Header token present
    const csrfToken = request.headers['x-csrf-token'] as string;
    if (!csrfToken) {
      await this.handleFailure(
        request,
        clientIp,
        StatefulCsrfFailureReason.HEADER_MISSING,
        userId,
      );
      throw new ForbiddenException('CSRF token header required');
    }

    // Check 3: Token validation against Redis
    const isValid = await this.csrfService.validateToken(userId, csrfToken);
    if (!isValid) {
      await this.handleFailure(
        request,
        clientIp,
        StatefulCsrfFailureReason.TOKEN_EXPIRED,
        userId,
      );
      throw new ForbiddenException('Invalid or expired CSRF token');
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
      // Fail-open on Redis error
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
    reason: StatefulCsrfFailureReason,
    userId: string | null,
  ): Promise<void> {
    // Log to audit
    await this.logCsrfFailure(request, reason, userId);

    // Increment failure counter
    try {
      const failKey = `${CSRF_RATE_LIMIT.FAILURE_KEY_PREFIX}${clientIp}`;
      const currentCount = await this.cacheService.incr(failKey);

      if (currentCount === 1) {
        await this.cacheService.expire(
          failKey,
          CSRF_RATE_LIMIT.FAILURE_WINDOW_TTL,
        );
      }

      if (currentCount >= CSRF_RATE_LIMIT.FAILURE_THRESHOLD) {
        await this.triggerBan(clientIp, currentCount);
      }

      this.logger.debug(
        `CSRF failure count for ${clientIp}: ${currentCount}/${CSRF_RATE_LIMIT.FAILURE_THRESHOLD}`,
      );
    } catch (error) {
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
          guardType: 'stateful',
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
    reason: StatefulCsrfFailureReason,
    userId: string | null,
  ): Promise<void> {
    const path = request.path || request.url;
    const method = request.method;
    const ipAddress = this.extractClientIp(request);
    const userAgent = request.headers['user-agent'] || 'unknown';

    try {
      await this.auditService.log({
        eventType: AuditEventType.CSRF_VALIDATION_FAILED,
        severity: AuditSeverity.HIGH,
        description: `Stateful CSRF validation failed: ${reason}`,
        userId: userId || undefined,
        ipAddress,
        userAgent,
        resourceType: 'csrf',
        details: {
          failureReason: reason,
          guardType: 'stateful',
          path,
          method,
          isAuthenticated: !!userId,
          hasHeaderToken: !!request.headers['x-csrf-token'],
        },
      });
    } catch (error) {
      this.logger.error('Failed to log CSRF_VALIDATION_FAILED event', error);
    }

    this.logger.warn(
      `CSRF BLOCKED (Stateful): ${reason} | ${method} ${path} | IP: ${ipAddress} | User: ${userId || 'anonymous'}`,
    );
  }

  private extractUserIdSafely(request: Request): string | null {
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
      null
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
 * @deprecated Use StatefulCsrfGuard instead
 */
export { StatefulCsrfGuard as CsrfGuard };

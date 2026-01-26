import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { ApiKeysService } from '../api-keys.service';
import { CacheService } from '../../cache/cache.service';
import { IpResolutionService } from '../../access-control/services/ip-resolution.service';
import { AuditService } from '../../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../../audit/entities/audit-log.entity';
import { ApiKey } from '../entities/api-key.entity';
import { hasScope } from '../constants/api-scopes.constant';

// =============================================================================
// RATE LIMITING CONFIGURATION
// =============================================================================

/**
 * Fixed Window Counter Rate Limiting
 */
const RATE_LIMIT_CONFIG = {
  NAMESPACE: 'rate_limit',
  WINDOW_SECONDS: 60,
  EXPIRE_BUFFER: 5,
} as const;

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  currentCount: number;
}

// =============================================================================
// GUARD
// =============================================================================

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private apiKeysService: ApiKeysService,
    private cacheService: CacheService,
    private ipResolutionService: IpResolutionService,
    private auditService: AuditService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Extract API key from headers
    const authHeader = request.headers['authorization'];
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

    let apiKeyString: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKeyString = authHeader.substring(7);
    } else if (apiKeyHeader) {
      apiKeyString = apiKeyHeader;
    }

    if (!apiKeyString) {
      return false; // No API key provided, let JWT guard handle it
    }

    // Get real client IP using trusted proxy resolution
    const clientIp = this.ipResolutionService.getClientIp(request);
    const userAgent = request.headers['user-agent'];

    // Validate the API key
    const keyRecord = await this.apiKeysService.validateKey(apiKeyString, {
      ipAddress: clientIp,
      userAgent,
    });

    if (!keyRecord) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // =========================================================================
    // IP ALLOWLIST CHECK (Zero Trust - Bind key to infrastructure)
    // =========================================================================
    const ipAllowed = await this.checkIpAllowlist(
      keyRecord,
      clientIp,
      userAgent,
    );
    if (!ipAllowed) {
      // Already logged in checkIpAllowlist()
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'IP address not allowed for this API key',
        error: 'Forbidden',
        clientIp: clientIp,
      });
    }

    // =========================================================================
    // RATE LIMITING CHECK (Fixed Window Counter)
    // =========================================================================
    const rateLimitResult = await this.checkRateLimit(keyRecord);
    this.setRateLimitHeaders(response, rateLimitResult);

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil(
        (rateLimitResult.resetAt - Date.now()) / 1000,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          error: 'Too Many Requests',
          retryAfter,
          limit: rateLimitResult.limit,
          resetAt: new Date(rateLimitResult.resetAt).toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // =========================================================================
    // SCOPE VALIDATION (With Hierarchy Support)
    // =========================================================================
    // Uses hasScope() which expands scopes via 'implies' field.
    // E.g., projects:admin implies [projects:read, projects:write, projects:delete]
    const requiredScopes = this.reflector.get<string[]>(
      'scopes',
      context.getHandler(),
    );
    if (requiredScopes && requiredScopes.length > 0) {
      const missingScopes = requiredScopes.filter(
        (scope) => !hasScope(keyRecord.scopes, scope),
      );
      if (missingScopes.length > 0) {
        this.logger.warn(
          `API key ${keyRecord.keyPrefix}... missing scopes: ${missingScopes.join(', ')}`,
        );
        throw new UnauthorizedException(
          `Missing required scopes: ${missingScopes.join(', ')}`,
        );
      }
    }

    // Attach user and API key to request
    (request as unknown as Record<string, unknown>).user = keyRecord.user;
    (request as unknown as Record<string, unknown>).apiKey = keyRecord;

    return true;
  }

  // ===========================================================================
  // IP ALLOWLIST RESTRICTION
  // ===========================================================================

  /**
   * Check if request IP is allowed for this API key.
   *
   * SECURITY RULES:
   * - If allowedIps is null or empty: Allow all (unrestricted)
   * - If allowedIps has entries: IP must match at least one
   *
   * On denial: Logs API_KEY_IP_DENIED audit event with attacker's IP
   */
  private async checkIpAllowlist(
    apiKey: ApiKey,
    clientIp: string,
    userAgent?: string,
  ): Promise<boolean> {
    // No restrictions = allow all
    if (!apiKey.allowedIps || apiKey.allowedIps.length === 0) {
      return true;
    }

    // Check IP against allowlist using IpResolutionService
    const isAllowed = this.ipResolutionService.isIpInAllowlist(
      clientIp,
      apiKey.allowedIps,
    );

    if (!isAllowed) {
      // =====================================================================
      // AUDIT LOG: API_KEY_IP_DENIED (Severity: HIGH)
      // This is a SECURITY EVENT - potential stolen key usage attempt
      // =====================================================================
      this.logger.warn(
        `API key ${apiKey.keyPrefix}... blocked: IP ${clientIp} not in allowlist`,
      );

      try {
        await this.auditService.log({
          eventType: AuditEventType.API_KEY_IP_DENIED,
          severity: AuditSeverity.HIGH,
          description: `API key access blocked: IP ${clientIp} not in allowlist`,
          userId: apiKey.userId,
          resourceType: 'api_key',
          resourceId: apiKey.id,
          ipAddress: clientIp,
          userAgent: userAgent,
          details: {
            keyPrefix: apiKey.keyPrefix,
            keyName: apiKey.name,
            attemptedIp: clientIp,
            allowedIps: apiKey.allowedIps,
            reason: 'IP not in allowlist',
            // SECURITY: Do not log scopes here (info disclosure)
          },
        });
      } catch (error) {
        // Audit failure should not prevent the security block
        this.logger.error('Failed to log API_KEY_IP_DENIED event', error);
      }

      return false;
    }

    return true;
  }

  // ===========================================================================
  // RATE LIMITING IMPLEMENTATION
  // ===========================================================================

  private async checkRateLimit(apiKey: ApiKey): Promise<RateLimitResult> {
    const limit = apiKey.rateLimit || 100;
    const currentMinute = Math.floor(Date.now() / 60000);
    const windowKey = `${apiKey.id}:${currentMinute}`;
    const resetAt = (currentMinute + 1) * 60000;

    try {
      const currentCount = await this.cacheService.incr(windowKey, {
        namespace: RATE_LIMIT_CONFIG.NAMESPACE,
      });

      if (currentCount === 1) {
        await this.cacheService.expire(
          windowKey,
          RATE_LIMIT_CONFIG.WINDOW_SECONDS + RATE_LIMIT_CONFIG.EXPIRE_BUFFER,
          { namespace: RATE_LIMIT_CONFIG.NAMESPACE },
        );
      }

      const allowed = currentCount <= limit;
      const remaining = Math.max(0, limit - currentCount);

      if (!allowed) {
        this.logger.warn(
          `Rate limit exceeded for API key ${apiKey.keyPrefix}... (${currentCount}/${limit})`,
        );
      }

      return { allowed, limit, remaining, resetAt, currentCount };
    } catch (error) {
      // FAIL-OPEN: Redis failure should not block legitimate users
      this.logger.error(
        `Rate limit check failed (FAIL-OPEN): ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return {
        allowed: true,
        limit,
        remaining: limit,
        resetAt,
        currentCount: 0,
      };
    }
  }

  private setRateLimitHeaders(
    response: Response,
    result: RateLimitResult,
  ): void {
    response.setHeader('X-RateLimit-Limit', result.limit.toString());
    response.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    response.setHeader(
      'X-RateLimit-Reset',
      Math.floor(result.resetAt / 1000).toString(),
    );

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      response.setHeader('Retry-After', retryAfter.toString());
    }
  }
}

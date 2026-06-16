import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import {
  API_KEY_AUDIT_TOKEN,
  API_KEY_VALIDATOR_TOKEN,
} from '../constants/api-keys.tokens';
import {
  CACHE_COUNTER_TOKEN,
  CACHE_STORE_TOKEN,
} from '../../cache/constants/cache.tokens';
import {
  ICacheCounter,
  ICacheStore,
} from '../../cache/interfaces/cache.interfaces';
import {
  CLIENT_IP_RESOLVER_TOKEN,
  IClientIpResolver,
} from '../../access-control';
import {
  IApiKeyAuditLogger,
  IApiKeyValidator,
  ValidatedApiKey,
} from '../interfaces/api-keys.interfaces';
import { hasScope } from '../constants/api-scopes.constant';

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

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    @Inject(API_KEY_VALIDATOR_TOKEN)
    private readonly validator: IApiKeyValidator,
    @Inject(API_KEY_AUDIT_TOKEN)
    private readonly audit: IApiKeyAuditLogger,
    @Inject(CACHE_COUNTER_TOKEN) private readonly cacheCounter: ICacheCounter,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
    @Inject(CLIENT_IP_RESOLVER_TOKEN)
    private readonly ipResolver: IClientIpResolver,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const authHeader = request.headers['authorization'];
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

    let apiKeyString: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKeyString = authHeader.substring(7);
    } else if (apiKeyHeader) {
      apiKeyString = apiKeyHeader;
    }

    if (!apiKeyString) {
      return false;
    }

    const clientIp = this.ipResolver.getClientIp(request);
    const userAgent = request.headers['user-agent'];

    const keyRecord = await this.validator.validate(apiKeyString, {
      ipAddress: clientIp,
      userAgent,
    });

    if (!keyRecord) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    const ipAllowed = this.checkIpAllowlist(keyRecord, clientIp, userAgent);
    if (!ipAllowed) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'IP address not allowed for this API key',
        error: 'Forbidden',
        clientIp,
      });
    }

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

    const requiredScopes = this.reflector.get<string[]>(
      'scopes',
      context.getHandler(),
    );
    if (requiredScopes && requiredScopes.length > 0) {
      const missingScopes = requiredScopes.filter(
        (scope) => !hasScope([...keyRecord.scopes], scope),
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

    (request as unknown as Record<string, unknown>).user = {
      id: keyRecord.userId,
      organizationId: keyRecord.organizationId ?? undefined,
    };
    (request as unknown as Record<string, unknown>).apiKey = keyRecord;

    return true;
  }

  private checkIpAllowlist(
    apiKey: ValidatedApiKey,
    clientIp: string,
    userAgent?: string,
  ): boolean {
    if (!apiKey.allowedIps || apiKey.allowedIps.length === 0) {
      return true;
    }

    const isAllowed = this.ipResolver.isIpInAllowlist(clientIp, [
      ...apiKey.allowedIps,
    ]);

    if (!isAllowed) {
      this.logger.warn(
        `API key ${apiKey.keyPrefix}... blocked: IP ${clientIp} not in allowlist`,
      );
      this.audit
        .logIpDenied(apiKey, clientIp, { ipAddress: clientIp, userAgent })
        .catch((err) =>
          this.logger.error('Failed to log API_KEY_IP_DENIED event', err),
        );
      return false;
    }

    return true;
  }

  private async checkRateLimit(
    apiKey: ValidatedApiKey,
  ): Promise<RateLimitResult> {
    const limit = apiKey.rateLimit || 100;
    const currentMinute = Math.floor(Date.now() / 60000);
    const windowKey = `${apiKey.id}:${currentMinute}`;
    const resetAt = (currentMinute + 1) * 60000;

    try {
      const currentCount = await this.cacheCounter.incr(windowKey, {
        namespace: RATE_LIMIT_CONFIG.NAMESPACE,
      });

      if (currentCount === 1) {
        await this.cacheStore.expire(
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

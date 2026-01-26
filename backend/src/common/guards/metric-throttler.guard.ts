import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  ThrottlerException,
} from '@nestjs/throttler';
import { Counter, register } from 'prom-client';
import { RateLimitConfig } from '../../config/rate-limit.config';
import { RATE_LIMIT_KEY } from './configurable-throttler.guard';

// =============================================================================
// METRIC THROTTLER GUARD (Phase 5 - Common Module Remediation)
// Extends ThrottlerGuard with Prometheus metrics for observability
// =============================================================================

/**
 * MetricThrottlerGuard - Rate Limiting with Prometheus Observability
 *
 * SECURITY/SRE VALUE:
 * - Tracks allowed vs blocked requests
 * - Enables alerting on rate limit abuse (attacks)
 * - Provides visibility into user impact from limits
 *
 * CARDINALITY DESIGN:
 * - Labels: status (allowed/blocked), context (controller name)
 * - NO high-cardinality labels (ip, userId, full path)
 * - Uses route pattern, not raw path (prevents /users/123 explosion)
 */
@Injectable()
export class MetricThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(MetricThrottlerGuard.name);

  // ==========================================================================
  // PROMETHEUS METRICS (Phase 5 - Common Module Remediation)
  // ==========================================================================

  /**
   * Counter for rate limit decisions.
   *
   * Labels:
   * - status: 'allowed' | 'blocked'
   * - context: Controller class name (low cardinality)
   * - limit_type: Rate limit type from decorator (login, api, global)
   */
  private readonly rateLimitCounter: Counter<string>;

  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);

    // Initialize Prometheus Counter
    // Check if metric already exists (prevents duplicate registration on hot reload)
    const existingMetric = register.getSingleMetric(
      'rate_limit_requests_total',
    );
    if (existingMetric) {
      this.rateLimitCounter = existingMetric as Counter<string>;
    } else {
      this.rateLimitCounter = new Counter({
        name: 'rate_limit_requests_total',
        help: 'Total number of requests processed by rate limiter',
        labelNames: ['status', 'context', 'limit_type'],
      });
    }

    this.logger.log('Rate limit metrics initialized');
  }

  /**
   * Override canActivate to wrap with metrics collection.
   *
   * DESIGN:
   * - Calls super.canActivate() which internally calls handleRequest
   * - If ThrottlerException thrown -> blocked
   * - If returns true -> allowed
   *
   * NOTE: We catch and re-throw to ensure the 429 response is preserved
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const controllerClass = context.getClass();
    const contextName = controllerClass?.name || 'Unknown';
    const limitType = this.getRateLimitType(context);

    try {
      // Delegate to parent - this checks rate limits
      const result = await super.canActivate(context);

      // If we get here, request was allowed
      this.rateLimitCounter.inc({
        status: 'allowed',
        context: contextName,
        limit_type: limitType,
      });

      return result;
    } catch (error) {
      // Check if this is a rate limit block
      if (error instanceof ThrottlerException) {
        this.rateLimitCounter.inc({
          status: 'blocked',
          context: contextName,
          limit_type: limitType,
        });

        // Log for security monitoring
        this.logRateLimitBlock(context, limitType);

        // Re-throw to preserve 429 response
        throw error;
      }

      // Other errors should propagate unchanged
      throw error;
    }
  }

  /**
   * Get the rate limit type from decorator metadata.
   * Mirrors the logic in ConfigurableThrottlerGuard.
   */
  private getRateLimitType(context: ExecutionContext): string {
    const handler = context.getHandler();
    const type = Reflect.getMetadata(RATE_LIMIT_KEY, handler) as
      | string
      | undefined;
    return type || 'global';
  }

  /**
   * Override getLimit to use configurable rate limits.
   * Note: Returns Promise per parent interface, but our logic is synchronous.
   */
  protected getLimit(context: ExecutionContext): Promise<number> {
    const rateLimitType = this.getRateLimitType(context);
    const rateLimitConfig =
      this.configService.get<RateLimitConfig>('rateLimit');

    if (!rateLimitConfig) {
      return Promise.resolve(100); // Safe default
    }

    // Use type-safe key access with fallback to global
    const configKey = rateLimitType as keyof RateLimitConfig;
    const config =
      (rateLimitConfig[configKey] as
        | { limit?: number; ttlMs?: number }
        | undefined) ?? rateLimitConfig.global;
    return Promise.resolve(config?.limit ?? 100);
  }

  /**
   * Override getTtl to use configurable TTL.
   * Note: Returns Promise per parent interface, but our logic is synchronous.
   */
  protected getTtl(context: ExecutionContext): Promise<number> {
    const rateLimitType = this.getRateLimitType(context);
    const rateLimitConfig =
      this.configService.get<RateLimitConfig>('rateLimit');

    if (!rateLimitConfig) {
      return Promise.resolve(60000); // Safe default: 1 minute
    }

    // Use type-safe key access with fallback to global
    const configKey = rateLimitType as keyof RateLimitConfig;
    const config =
      (rateLimitConfig[configKey] as
        | { limit?: number; ttlMs?: number }
        | undefined) ?? rateLimitConfig.global;
    return Promise.resolve(config?.ttlMs ?? 60000);
  }

  /**
   * Logs rate limit blocks for security monitoring.
   *
   * SECURITY: Does NOT log IP address or user details directly.
   * Those can be correlated via requestId if needed.
   */
  private logRateLimitBlock(
    context: ExecutionContext,
    limitType: string,
  ): void {
    const request = context
      .switchToHttp()
      .getRequest<{ method?: string; url?: string }>();
    const method = request?.method || 'UNKNOWN';
    const url = request?.url || 'UNKNOWN';

    this.logger.warn(
      `[RATE_LIMIT] Blocked: ${method} ${url} | Type: ${limitType}`,
    );
  }
}

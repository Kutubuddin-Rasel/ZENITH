import { Injectable, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { RateLimitConfig } from '../../config/rate-limit.config';

/**
 * Rate Limit Key - used as decorator metadata key
 */
export const RATE_LIMIT_KEY = 'rate_limit_key';

/**
 * Decorator to specify which rate limit configuration to use
 *
 * @example
 * @RateLimitType('login')
 * @Post('login')
 * async login() { ... }
 */
export function RateLimitType(type: keyof RateLimitConfig): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata(RATE_LIMIT_KEY, type, descriptor.value!);
    return descriptor;
  };
}

/**
 * ConfigurableThrottlerGuard - Enterprise Rate Limiting
 *
 * Reads rate limit configuration from typed config module,
 * allowing runtime configuration via environment variables.
 *
 * Usage:
 * 1. Apply @UseGuards(ConfigurableThrottlerGuard) to controller/method
 * 2. Use @RateLimitType('login') to specify which config to use
 * 3. Falls back to 'global' if no type specified
 */
@Injectable()
export class ConfigurableThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Get the rate limit configuration for the current request.
   * Note: Returns Promise per parent interface, but our logic is synchronous.
   */
  protected getLimit(context: ExecutionContext): Promise<number> {
    const rateLimitType = this.getRateLimitType(context);
    const rateLimitConfig =
      this.configService.get<RateLimitConfig>('rateLimit');

    if (!rateLimitConfig) {
      return Promise.resolve(100); // Safe default
    }

    const config = rateLimitConfig[rateLimitType] || rateLimitConfig.global;
    return Promise.resolve(config?.limit || 100);
  }

  /**
   * Get the TTL for the current request.
   * Note: Returns Promise per parent interface, but our logic is synchronous.
   */
  protected getTtl(context: ExecutionContext): Promise<number> {
    const rateLimitType = this.getRateLimitType(context);
    const rateLimitConfig =
      this.configService.get<RateLimitConfig>('rateLimit');

    if (!rateLimitConfig) {
      return Promise.resolve(60000); // Safe default: 1 minute
    }

    const config = rateLimitConfig[rateLimitType] || rateLimitConfig.global;
    return Promise.resolve(config?.ttlMs || 60000);
  }

  /**
   * Get the rate limit type from decorator metadata
   */
  private getRateLimitType(context: ExecutionContext): keyof RateLimitConfig {
    const handler = context.getHandler();
    const type = Reflect.getMetadata(RATE_LIMIT_KEY, handler) as
      | keyof RateLimitConfig
      | undefined;
    return type || 'global';
  }
}

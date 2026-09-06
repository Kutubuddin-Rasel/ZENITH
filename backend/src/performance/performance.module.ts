import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../cache/cache.module';
import { CommonObservabilityModule } from '../common/submodules/observability.module';
import {
  API_CACHE_TOKEN,
  RATE_LIMITER_TOKEN,
  RESPONSE_COMPRESSOR_TOKEN,
  RESPONSE_OPTIMIZER_TOKEN,
} from './constants/performance.tokens';
import { ApiCacheService } from './services/api-cache.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { ResponseCompressorService } from './services/response-compressor.service';
import { ResponseOptimizerService } from './services/response-optimizer.service';

/**
 * Performance Module — Domain-Agnostic Edge Infrastructure.
 *
 * Provides ISP-segregated API optimization utilities:
 *   - API_CACHE_TOKEN       → HTTP caching + response store
 *   - RATE_LIMITER_TOKEN    → Atomic Redis rate limiting
 *   - RESPONSE_COMPRESSOR_TOKEN → Gzip compression/decompression
 *   - RESPONSE_OPTIMIZER_TOKEN  → Payload null-stripping
 *
 * All providers are bound via DIP-compliant custom providers (`useClass`).
 * Consumers inject ONLY the token they need — no god-class surface exposure.
 *
 * NOT @Global() — modules requiring performance utilities must explicitly
 * import PerformanceModule (strict boundary enforcement).
 */
@Module({
  imports: [ConfigModule, CacheModule, CommonObservabilityModule],
  controllers: [],
  providers: [
    { provide: API_CACHE_TOKEN, useClass: ApiCacheService },
    { provide: RATE_LIMITER_TOKEN, useClass: RateLimiterService },
    { provide: RESPONSE_COMPRESSOR_TOKEN, useClass: ResponseCompressorService },
    { provide: RESPONSE_OPTIMIZER_TOKEN, useClass: ResponseOptimizerService },
  ],
  exports: [
    API_CACHE_TOKEN,
    RATE_LIMITER_TOKEN,
    RESPONSE_COMPRESSOR_TOKEN,
    RESPONSE_OPTIMIZER_TOKEN,
  ],
})
export class PerformanceModule {}

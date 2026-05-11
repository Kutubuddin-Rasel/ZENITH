import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../cache/cache.module';
import { CommonObservabilityModule } from '../common/submodules/observability.module';
import { ApiOptimizerService } from './api-optimizer.service';

/**
 * Performance Module
 *
 * Provides API optimization utilities. The Prometheus registry and the
 * `PERFORMANCE_METRICS_READER_TOKEN` are imported via
 * `CommonObservabilityModule` (Step 4 — explicit submodule dependencies
 * after the `@Global()` `CommonModule` was demolished).
 */
@Global()
@Module({
  imports: [ConfigModule, CacheModule, CommonObservabilityModule],
  controllers: [],
  providers: [ApiOptimizerService],
  exports: [ApiOptimizerService],
})
export class PerformanceModule {}

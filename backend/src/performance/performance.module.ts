import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../cache/cache.module';
import { ApiOptimizerService } from './api-optimizer.service';

/**
 * Performance Module
 *
 * Provides API optimization utilities.
 *
 * NOTE: Prometheus metrics (MetricsService + MetricsController) have been
 * consolidated into CommonModule to avoid duplicate /metrics endpoints
 * and ensure all metrics use the same registry.
 */
@Global()
@Module({
  imports: [ConfigModule, CacheModule],
  controllers: [],
  providers: [ApiOptimizerService],
  exports: [ApiOptimizerService],
})
export class PerformanceModule {}

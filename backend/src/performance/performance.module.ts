import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../cache/cache.module';
import { ApiOptimizerService } from './api-optimizer.service';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  imports: [ConfigModule, CacheModule],
  controllers: [MetricsController],
  providers: [ApiOptimizerService, MetricsService],
  exports: [ApiOptimizerService, MetricsService],
})
export class PerformanceModule {}

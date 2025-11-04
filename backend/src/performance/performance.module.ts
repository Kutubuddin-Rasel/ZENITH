import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../cache/cache.module';
import { ApiOptimizerService } from './api-optimizer.service';

@Global()
@Module({
  imports: [ConfigModule, CacheModule],
  providers: [ApiOptimizerService],
  exports: [ApiOptimizerService],
})
export class PerformanceModule {}

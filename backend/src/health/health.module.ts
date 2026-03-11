import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.health';
import { BullMQHealthIndicator } from './indicators/bullmq.health';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    TerminusModule,
    CacheModule,
    ConfigModule, // Defensive: ensures ConfigService available even if not global
    // CoreQueueModule is @Global() — BullModule queues are available without explicit import
  ],
  controllers: [HealthController],
  providers: [
    RedisHealthIndicator,
    BullMQHealthIndicator,
  ],
})
export class HealthModule {}

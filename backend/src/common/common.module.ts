import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EncryptionService } from './services/encryption.service';
import { MetricsService } from './services/metrics.service';
import { AlertService } from './services/alert.service';
import { MetricsController } from './controllers/metrics.controller';
import { HealthController } from './controllers/health.controller';
import { Integration } from '../integrations/entities/integration.entity';

/**
 * Global module for shared services across the application.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Integration])],
  providers: [EncryptionService, MetricsService, AlertService],
  controllers: [MetricsController, HealthController],
  exports: [EncryptionService, MetricsService, AlertService],
})
export class CommonModule {}

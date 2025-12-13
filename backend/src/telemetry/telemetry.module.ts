import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { BullModule } from '@nestjs/bullmq';
import { TelemetryProcessor } from './telemetry.processor';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { IssuesModule } from '../issues/issues.module';

@Module({
  imports: [
    ApiKeysModule,
    IssuesModule,
    BullModule.registerQueue({
      name: 'telemetry',
    }),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryProcessor],
  exports: [TelemetryService],
})
export class TelemetryModule {}

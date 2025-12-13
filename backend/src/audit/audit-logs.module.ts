import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsWorker } from './audit-logs.worker';
import { ClickHouseClient } from './clickhouse.client';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'audit-queue',
    }),
  ],
  providers: [AuditLogsService, AuditLogsWorker, ClickHouseClient],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}

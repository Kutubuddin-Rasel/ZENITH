import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './services/audit.service';
import { AuditController } from './controllers/audit.controller';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { User } from '../users/entities/user.entity';
// Sprint 2: Import processor and its dependencies
import { AuditLogsWorker } from './audit-logs.worker';
import { ClickHouseClient } from './clickhouse.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, User]),
    // Queue registration now in CoreQueueModule (global)
  ],
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    // Sprint 2: Add processor and its dependency
    AuditLogsWorker,
    ClickHouseClient,
  ],
  controllers: [AuditController],
  exports: [AuditService, ClickHouseClient],
})
export class AuditModule {}

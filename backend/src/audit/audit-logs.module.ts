import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsWorker } from './audit-logs.worker';
import { ClickHouseClient } from './clickhouse.client';
import { CircuitAuditLoggerAdapter } from './adapters/circuit-audit-logger.adapter';
import { AuditLogsBypassWriterAdapter } from './adapters/audit-logs-bypass-writer.adapter';
import { CIRCUIT_AUDIT_LOGGER_TOKEN } from '../circuit-breaker/constants/circuit-breaker.tokens';
import { BYPASS_AUDIT_WRITER_TOKEN } from '../core/tenant/constants/tenant.tokens';

/**
 * AuditLogs Module
 *
 * Owns the BullMQ-backed `AuditLogsService` plus its worker and
 * ClickHouse client.
 *
 * DIP boundary: registers domain-specific audit adapters against the
 * abstract tokens owned by the consuming modules, so cross-cutting
 * subsystems (`circuit-breaker`, `core/tenant`) never import
 * `AuditLogsService` directly.
 *
 * - `CIRCUIT_AUDIT_LOGGER_TOKEN`  → `CircuitAuditLoggerAdapter`
 * - `BYPASS_AUDIT_WRITER_TOKEN`   → `AuditLogsBypassWriterAdapter`
 */
@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'audit-queue',
    }),
  ],
  providers: [
    AuditLogsService,
    AuditLogsWorker,
    ClickHouseClient,
    {
      provide: CIRCUIT_AUDIT_LOGGER_TOKEN,
      useClass: CircuitAuditLoggerAdapter,
    },
    {
      provide: BYPASS_AUDIT_WRITER_TOKEN,
      useClass: AuditLogsBypassWriterAdapter,
    },
  ],
  exports: [
    AuditLogsService,
    CIRCUIT_AUDIT_LOGGER_TOKEN,
    BYPASS_AUDIT_WRITER_TOKEN,
  ],
})
export class AuditLogsModule {}

/**
 * AuditLogsBypassWriterAdapter
 *
 * Implements `IBypassAuditWriter` (declared in `core/tenant`) by
 * forwarding tenant-scope bypass transitions to `AuditLogsService`.
 *
 * DIP boundary: this adapter is the ONLY place that knows the
 * `AuditLogEvent` shape required by the BullMQ-backed audit pipeline —
 * `TenantContext` depends solely on the abstract contract.
 *
 * Resilience: failures are swallowed and logged so a degraded audit
 * pipeline never blocks the privileged-operation path (matches the
 * fail-open contract of `CircuitAuditLoggerAdapter`).
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type {
  BypassAuditContext,
  IBypassAuditWriter,
  TenantAuditEvent,
} from '../../core/tenant/interfaces/tenant.interfaces';
import { AuditLogsService } from '../audit-logs.service';

@Injectable()
export class AuditLogsBypassWriterAdapter implements IBypassAuditWriter {
  private readonly logger = new Logger(AuditLogsBypassWriterAdapter.name);

  constructor(private readonly auditLogsService: AuditLogsService) {}

  async recordBypass(
    event: TenantAuditEvent,
    context: BypassAuditContext,
  ): Promise<void> {
    try {
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: context.tenantId ?? 'system',
        actor_id: context.userId,
        resource_type: 'TenantContext',
        resource_id: 'bypass_scope',
        action_type: 'UPDATE',
        action: event,
        metadata: {
          severity: 'HIGH',
          reason: context.reason,
          bypassState: event === 'TENANT_BYPASS_ENABLED',
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to log tenant bypass audit event (${event}):`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type {
  CircuitAuditContext,
  CircuitStateChange,
  ICircuitAuditLogger,
} from '../../circuit-breaker/interfaces/circuit-breaker.interfaces';
import { AuditLogsService } from '../audit-logs.service';

type CircuitAuditAction = 'CIRCUIT_MANUALLY_TRIPPED' | 'CIRCUIT_MANUALLY_RESET';

/**
 * CircuitAuditLoggerAdapter
 *
 * Satisfies the abstract `ICircuitAuditLogger` contract for the
 * circuit-breaker module. Owns the `AuditLogEvent` shape construction so
 * the breaker engine never builds audit payloads directly.
 *
 * Resilience: failures are swallowed and logged — operational state
 * changes must succeed even when the audit pipeline is degraded.
 */
@Injectable()
export class CircuitAuditLoggerAdapter implements ICircuitAuditLogger {
  private readonly logger = new Logger(CircuitAuditLoggerAdapter.name);

  constructor(private readonly auditLogsService: AuditLogsService) {}

  async logTrip(
    breakerName: string,
    context: CircuitAuditContext,
    stateChange: CircuitStateChange,
  ): Promise<void> {
    await this.emit(
      'CIRCUIT_MANUALLY_TRIPPED',
      breakerName,
      context,
      stateChange,
    );
  }

  async logReset(
    breakerName: string,
    context: CircuitAuditContext,
    stateChange: CircuitStateChange,
  ): Promise<void> {
    await this.emit(
      'CIRCUIT_MANUALLY_RESET',
      breakerName,
      context,
      stateChange,
    );
  }

  private async emit(
    action: CircuitAuditAction,
    breakerName: string,
    context: CircuitAuditContext,
    stateChange: CircuitStateChange,
  ): Promise<void> {
    try {
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: context.tenantId ?? 'system',
        actor_id: context.userId,
        resource_type: 'CircuitBreaker',
        resource_id: breakerName,
        action_type: 'UPDATE',
        action,
        metadata: {
          severity: 'HIGH',
          reason: context.reason,
          ...stateChange,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to log audit event for ${action}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}

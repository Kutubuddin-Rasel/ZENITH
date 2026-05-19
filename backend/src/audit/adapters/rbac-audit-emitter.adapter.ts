import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AuditLogsService } from '../audit-logs.service';
import type {
  IAuditEmitterPort,
  RbacAuditAction,
  RbacAuditEvent,
} from '../../rbac';

/**
 * RbacAuditEmitterAdapter
 *
 * Canonical implementation of the RBAC outbound audit port
 * (`IAuditEmitterPort`). Lives inside the audit module — the rightful
 * owner of audit emission — so RBAC never imports `AuditLogsService`
 * directly.
 *
 * Bound to `RBAC_AUDIT_EMITTER_TOKEN` inside `AuditLogsModule`, matching
 * the existing adapter pattern used for `CIRCUIT_AUDIT_LOGGER_TOKEN` and
 * `BYPASS_AUDIT_WRITER_TOKEN`.
 *
 * Action mapping is intentionally conservative: each canonical RBAC
 * audit action maps to one `action_type` so the downstream audit search
 * UX is unchanged.
 */
@Injectable()
export class RbacAuditEmitterAdapter implements IAuditEmitterPort {
  private readonly logger = new Logger(RbacAuditEmitterAdapter.name);

  constructor(private readonly auditLogsService: AuditLogsService) {}

  async emit(event: RbacAuditEvent): Promise<void> {
    try {
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: event.occurredAt,
        tenant_id: event.organizationId ?? 'system',
        actor_id: event.actorId,
        resource_type: 'Role',
        resource_id: event.roleId,
        action_type: this.mapActionType(event.action),
        metadata: {
          event: event.action,
          ...(event.metadata ?? {}),
        },
      });
    } catch (error) {
      // Never let audit emission break the calling write path.
      this.logger.error(
        `Failed to emit RBAC audit event "${event.action}": ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private mapActionType(
    action: RbacAuditAction,
  ): 'CREATE' | 'UPDATE' | 'DELETE' {
    switch (action) {
      case 'rbac.role.created':
        return 'CREATE';
      case 'rbac.role.permissions_updated':
        return 'UPDATE';
      case 'rbac.role.deleted':
        return 'DELETE';
    }
  }
}

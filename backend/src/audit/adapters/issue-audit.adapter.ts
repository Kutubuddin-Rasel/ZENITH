import { Injectable } from '@nestjs/common';

// Sealed-barrel consumption: port + DTO come from `issues/index.ts`.
import { AuditPort, AuditEntry } from '../../issues';
import { AuditLogsService } from '../audit-logs.service';
import { AuditLogEvent } from '../interfaces/audit-log-event.interface';

/**
 * IssueAuditAdapter — capability-owner side of the issues → audit inversion.
 *
 * Implements the issues-owned `AuditPort` by mapping the slim `AuditEntry`
 * envelope onto the worker-facing `AuditLogEvent` and delegating to the
 * BullMQ-backed `AuditLogsService`. Bound + re-exported by the `@Global`
 * `AuditLogsModule`, so the port inherits the global reach `AuditLogsService`
 * already has.
 *
 * The mapping is identity on the fields issues sets; the worker-only aliases
 * (`id`, `userId`, `entityType`, `entityId`, `changes`, …) on `AuditLogEvent`
 * stay unset exactly as they were when issues called `.log({...})` directly.
 */
@Injectable()
export class IssueAuditAdapter extends AuditPort {
  constructor(private readonly auditLogs: AuditLogsService) {
    super();
  }

  async log(entry: AuditEntry): Promise<void> {
    const event: AuditLogEvent = {
      event_uuid: entry.event_uuid,
      timestamp: entry.timestamp,
      tenant_id: entry.tenant_id,
      actor_id: entry.actor_id,
      projectId: entry.projectId,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      action_type: entry.action_type,
      action: entry.action,
      metadata: entry.metadata,
    };
    await this.auditLogs.log(event);
  }
}

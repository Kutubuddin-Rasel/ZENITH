import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';

import { AuditLogsService } from '../../audit/audit-logs.service';
import type { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface';
import type {
  AuditLogEntry,
  IAuditLogWriter,
} from '../interfaces/projects.interfaces';

/**
 * AuditLogWriterAdapter
 *
 * Bound to `AUDIT_LOG_WRITER_TOKEN` inside `ProjectsModule`. Maps the
 * narrow `AuditLogEntry` DTO consumed by `ProjectCommandService` /
 * `ProjectAccessCommandService` onto the legacy `AuditLogEvent` shape
 * accepted by the BullMQ-backed `AuditLogsService`.
 *
 * Why an adapter (not a direct dependency)
 * ----------------------------------------
 * The legacy event interface carries 6 dual-named aliases
 * (`tenant_id`/`projectId`, `actor_id`/`userId`,
 * `resource_type`/`entityType`, `resource_id`/`entityId`,
 * `action_type`/`action`, `event_uuid`/`id`) for worker
 * compatibility. Pushing that shape into the command services would
 * leak audit-pipeline drift into the projects aggregate. The DTO
 * surface here stays uniform and we centralise the alias mapping in
 * one place.
 *
 * Request-id + UUID generation
 * ----------------------------
 * - `event_uuid` is generated per call (audit pipeline indexes on it).
 * - `timestamp` is set at call-time (NOT at enqueue-time inside the
 *   worker) so reordered queue processing does not skew the trail.
 * - `requestId` is pulled from `nestjs-cls` and stitched onto
 *   `metadata.requestId` so the audit row joins back to the originating
 *   HTTP request log entry.
 *
 * Fire-and-forget semantics
 * -------------------------
 * The underlying `AuditLogsService.log` only awaits the BullMQ enqueue
 * (Redis), NOT persistence. Safe to call inside a
 * `dataSource.transaction(...)` callback — no DB connection is taken.
 */
@Injectable()
export class AuditLogWriterAdapter implements IAuditLogWriter {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly cls: ClsService,
  ) {}

  async log(entry: AuditLogEntry): Promise<void> {
    const requestId = this.safeClsGet('requestId');

    const metadata: Record<string, unknown> = {
      ...(entry.metadata ?? {}),
    };
    if (entry.severity) {
      metadata.severity = entry.severity;
    }
    if (requestId) {
      metadata.requestId = requestId;
    }

    const event: AuditLogEvent = {
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: entry.tenantId,
      actor_id: entry.actorId,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      action_type: entry.actionType,
      action: entry.action,
      projectId: entry.projectId,
      changes: entry.changes ? this.toMutableChanges(entry.changes) : undefined,
      metadata,
    };

    await this.auditLogsService.log(event);
  }

  private toMutableChanges(
    changes: Readonly<Record<string, readonly [string, string]>>,
  ): Record<string, [string, string]> {
    const out: Record<string, [string, string]> = {};
    for (const key of Object.keys(changes)) {
      const tuple = changes[key];
      out[key] = [tuple[0], tuple[1]];
    }
    return out;
  }

  private safeClsGet(key: string): string | undefined {
    try {
      const value = this.cls.get<string>(key);
      return value || undefined;
    } catch {
      return undefined;
    }
  }
}

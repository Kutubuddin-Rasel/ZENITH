/**
 * Issues Module — Outbound Port: AuditPort
 *
 * The issues god class emits five audit records (create / update / delete /
 * archive / status-change) by injecting the concrete, app-global
 * `AuditLogsService` and calling `.log(event)`. That couples issues to the
 * BullMQ-backed `AuditLogsService` implementation and its full
 * `AuditLogEvent` envelope (DIP CRITICAL).
 *
 * Inversion strategy (mirror of `UserLookupPort`):
 *   - issues owns this contract.
 *   - the audit-logs aggregate binds the adapter in its `@Global`
 *     `AuditLogsModule` via `{ provide: AuditPort, useClass: AuditAdapter }`
 *     and re-exports the token — inheriting the global reach
 *     `AuditLogsService` already has.
 *
 * The `AuditEntry` shape below is a structural superset-free copy of the
 * fields issues actually populates, so the port stays decoupled from the
 * `AuditLogEvent` interface (which carries worker-only aliases issues never
 * sets). The adapter maps `AuditEntry` → `AuditLogEvent`.
 */

/**
 * The audit envelope issues populates. Mirrors the `snake_case` shape the
 * downstream worker consumes; `metadata` is intentionally open
 * (`Record<string, unknown>`) since each call site carries domain-specific
 * detail (severity, issueKey, changed fields, …).
 */
export interface AuditEntry {
  readonly event_uuid: string;
  readonly timestamp: Date;
  readonly tenant_id: string;
  readonly actor_id: string;
  readonly projectId?: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly action_type:
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'VIEW'
    | 'LOGIN'
    | 'LOGOUT';
  readonly action?: string;
  readonly metadata?: Record<string, unknown>;
}

export abstract class AuditPort {
  /**
   * Enqueue an audit record. Fire-and-forget at the call site (the adapter
   * pushes onto the audit queue); resolves once the job is accepted.
   */
  abstract log(entry: AuditEntry): Promise<void>;
}

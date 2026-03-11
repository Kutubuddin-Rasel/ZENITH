import { AuditEventType, AuditSeverity } from '../entities/audit-log.entity';

// =============================================================================
// QUEUE CONFIGURATION
// =============================================================================

/** Queue name — used by @InjectQueue and @Processor */
export const SECURITY_ALERTS_QUEUE = 'security-alerts-queue';

/**
 * Job-level overrides for the security-alerts-queue.
 *
 * These override CoreQueueModule defaults (3 attempts, 1s exp backoff) with
 * settings tuned for external API reliability (Slack/PagerDuty):
 *
 * - 5 attempts (outages can last 1–2 min)
 * - Exponential backoff: 2s → 4s → 8s → 16s → 32s (total ~62s window)
 * - Dead-letter capped at 1000 (don't fill Redis with failed alerts)
 */
export const SECURITY_ALERT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: 500,
  removeOnFail: 1000,
} as const;

// =============================================================================
// JOB PAYLOAD (Strictly Typed, PII-Free)
// =============================================================================

/**
 * Data that leaves the VPC via Slack/PagerDuty.
 *
 * SECURITY: This interface is intentionally minimal. It contains NO:
 * - `details` (may contain raw SQL, tokens, or stack traces)
 * - `oldValues` / `newValues` (may contain PII diff)
 * - `sessionId`, `userAgent` (fingerprinting data)
 * - `userEmail`, `userName` (direct PII)
 */
export interface SecurityAlertJobPayload {
  /** Tenant scope for alert routing */
  organizationId: string;
  /** What happened */
  eventType: AuditEventType;
  /** Alert urgency */
  severity: AuditSeverity;
  /** Human-readable summary (audit log description) */
  message: string;
  /** User who triggered the event (UUID, not PII) */
  userId: string | null;
  /** Source IP for security forensics (acceptable for alert) */
  ipAddress: string | null;
  /** When the event occurred */
  timestamp: string;
  /** Audit log ID for cross-referencing */
  auditLogId: string;
}

// =============================================================================
// PII SANITIZER
// =============================================================================

/**
 * Minimum severity required to dispatch an alert.
 * Only HIGH and CRITICAL events trigger alerts.
 */
export const ALERT_SEVERITY_THRESHOLD: readonly AuditSeverity[] = [
  AuditSeverity.HIGH,
  AuditSeverity.CRITICAL,
];

/**
 * Build a PII-free payload from the full audit log data.
 *
 * This function is the ONLY path to the queue — it acts as a data exfiltration
 * gate by stripping all potentially sensitive fields before the payload leaves
 * the VPC boundary.
 */
export function sanitizeForAlert(
  auditLogId: string,
  organizationId: string,
  eventType: AuditEventType,
  severity: AuditSeverity,
  description: string,
  userId: string | null,
  ipAddress: string | null,
): SecurityAlertJobPayload {
  return {
    auditLogId,
    organizationId,
    eventType,
    severity,
    message: description.substring(0, 500), // Truncate to prevent payload bloat
    userId,
    ipAddress,
    timestamp: new Date().toISOString(),
  };
}

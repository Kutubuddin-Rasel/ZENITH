import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import {
  SECURITY_ALERTS_QUEUE,
  SecurityAlertJobPayload,
} from './security-alerts.constants';
import { AuditSeverity } from '../entities/audit-log.entity';

// =============================================================================
// OUTBOUND API RESPONSE TYPES (Strictly Typed)
// =============================================================================

/** Slack Incoming Webhook response */
interface SlackWebhookResponse {
  ok: boolean;
  error?: string;
}

/** PagerDuty Events API v2 response */
interface PagerDutyResponse {
  status: string;
  message: string;
  dedup_key: string;
}

// =============================================================================
// PROCESSOR
// =============================================================================

/**
 * SecurityAlertProcessor — BullMQ Worker for Slack & PagerDuty alerting
 *
 * ARCHITECTURE:
 * - Runs in the same process as the NestJS app (single-binary deployment)
 * - Each job contains a PII-sanitized SecurityAlertJobPayload
 * - Slack and PagerDuty calls are independent (one failing doesn't block the other)
 * - HTTP errors are caught and logged — the worker never crashes
 *
 * RETRY:
 * - Job-level: 5 attempts, exponential backoff 2s→32s
 * - If all 5 fail, the job moves to dead-letter (removeOnFail: 1000)
 *
 * CONFIGURATION:
 * - SLACK_SECURITY_WEBHOOK_URL: Slack Incoming Webhook URL
 * - PAGERDUTY_ROUTING_KEY: PagerDuty Events API v2 integration key
 *
 * If neither is configured, the processor logs a warning and skips delivery.
 */
@Processor(SECURITY_ALERTS_QUEUE)
export class SecurityAlertProcessor extends WorkerHost {
  private readonly logger = new Logger(SecurityAlertProcessor.name);

  private readonly slackWebhookUrl: string | undefined;
  private readonly pagerDutyRoutingKey: string | undefined;
  private readonly pagerDutyEventsUrl =
    'https://events.pagerduty.com/v2/enqueue';

  constructor(private readonly configService: ConfigService) {
    super();
    this.slackWebhookUrl = this.configService.get<string>(
      'SLACK_SECURITY_WEBHOOK_URL',
    );
    this.pagerDutyRoutingKey = this.configService.get<string>(
      'PAGERDUTY_ROUTING_KEY',
    );

    if (!this.slackWebhookUrl && !this.pagerDutyRoutingKey) {
      this.logger.warn(
        'Neither SLACK_SECURITY_WEBHOOK_URL nor PAGERDUTY_ROUTING_KEY configured. ' +
          'Security alerts will be logged to console only.',
      );
    }
  }

  // ===========================================================================
  // MAIN PROCESSOR
  // ===========================================================================

  async process(job: Job<SecurityAlertJobPayload>): Promise<void> {
    const payload = job.data;

    this.logger.log(
      `Processing security alert: ${payload.eventType} [${payload.severity}] ` +
        `org=${payload.organizationId} audit=${payload.auditLogId}`,
    );

    // Fire Slack and PagerDuty independently (parallel, fault-isolated)
    const results = await Promise.allSettled([
      this.sendSlackAlert(payload),
      this.sendPagerDutyAlert(payload),
    ]);

    // Log results
    const slackResult = results[0];
    const pagerDutyResult = results[1];

    if (slackResult.status === 'rejected') {
      this.logger.error(
        `Slack alert failed for audit=${payload.auditLogId}: ${String(slackResult.reason)}`,
      );
    }

    if (pagerDutyResult.status === 'rejected') {
      this.logger.error(
        `PagerDuty alert failed for audit=${payload.auditLogId}: ${String(pagerDutyResult.reason)}`,
      );
    }

    // If BOTH failed, throw to trigger BullMQ retry
    if (
      slackResult.status === 'rejected' &&
      pagerDutyResult.status === 'rejected'
    ) {
      throw new Error(
        `All alert channels failed for audit=${payload.auditLogId}. ` +
          `Slack: ${String(slackResult.reason)} | ` +
          `PagerDuty: ${String(pagerDutyResult.reason)}`,
      );
    }
  }

  // ===========================================================================
  // SLACK INTEGRATION
  // ===========================================================================

  private async sendSlackAlert(
    payload: SecurityAlertJobPayload,
  ): Promise<void> {
    if (!this.slackWebhookUrl) {
      this.logger.debug('Slack not configured — skipping');
      return;
    }

    const severityEmoji = this.getSeverityEmoji(payload.severity);
    const slackBody = {
      blocks: [
        {
          type: 'header' as const,
          text: {
            type: 'plain_text' as const,
            text: `${severityEmoji} Security Alert: ${payload.eventType}`,
            emoji: true,
          },
        },
        {
          type: 'section' as const,
          fields: [
            {
              type: 'mrkdwn' as const,
              text: `*Severity:*\n${payload.severity}`,
            },
            {
              type: 'mrkdwn' as const,
              text: `*Organization:*\n\`${payload.organizationId}\``,
            },
            {
              type: 'mrkdwn' as const,
              text: `*User ID:*\n\`${payload.userId || 'N/A'}\``,
            },
            {
              type: 'mrkdwn' as const,
              text: `*IP Address:*\n\`${payload.ipAddress || 'N/A'}\``,
            },
          ],
        },
        {
          type: 'section' as const,
          text: {
            type: 'mrkdwn' as const,
            text: `*Message:*\n${payload.message}`,
          },
        },
        {
          type: 'context' as const,
          elements: [
            {
              type: 'mrkdwn' as const,
              text: `Audit Log ID: \`${payload.auditLogId}\` | ${payload.timestamp}`,
            },
          ],
        },
      ],
    };

    const response = await fetch(this.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackBody),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Slack webhook failed: ${response.status} ${response.statusText} — ${errorText}`,
      );
    }

    this.logger.debug(`Slack alert sent for audit=${payload.auditLogId}`);
  }

  // ===========================================================================
  // PAGERDUTY INTEGRATION (Events API v2)
  // ===========================================================================

  private async sendPagerDutyAlert(
    payload: SecurityAlertJobPayload,
  ): Promise<void> {
    if (!this.pagerDutyRoutingKey) {
      this.logger.debug('PagerDuty not configured — skipping');
      return;
    }

    const pdSeverity = this.mapToPagerDutySeverity(payload.severity);

    const pdBody = {
      routing_key: this.pagerDutyRoutingKey,
      event_action: 'trigger' as const,
      dedup_key: `zenith-security-${payload.auditLogId}`,
      payload: {
        summary: `[Zenith Security] ${payload.eventType}: ${payload.message.substring(0, 200)}`,
        source: `zenith-org-${payload.organizationId}`,
        severity: pdSeverity,
        timestamp: payload.timestamp,
        component: 'audit-service',
        group: 'security',
        class: payload.eventType,
        custom_details: {
          audit_log_id: payload.auditLogId,
          organization_id: payload.organizationId,
          user_id: payload.userId,
          ip_address: payload.ipAddress,
          event_type: payload.eventType,
        },
      },
    };

    const response = await fetch(this.pagerDutyEventsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pdBody),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `PagerDuty API failed: ${response.status} ${response.statusText} — ${errorText}`,
      );
    }

    const pdResponse = (await response.json()) as PagerDutyResponse;
    this.logger.debug(
      `PagerDuty alert sent for audit=${payload.auditLogId}: dedup=${pdResponse.dedup_key}`,
    );
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private getSeverityEmoji(severity: AuditSeverity): string {
    switch (severity) {
      case AuditSeverity.CRITICAL:
        return '🚨';
      case AuditSeverity.HIGH:
        return '🔴';
      case AuditSeverity.MEDIUM:
        return '🟡';
      case AuditSeverity.LOW:
        return '🟢';
      default:
        return 'ℹ️';
    }
  }

  private mapToPagerDutySeverity(
    severity: AuditSeverity,
  ): 'critical' | 'error' | 'warning' | 'info' {
    switch (severity) {
      case AuditSeverity.CRITICAL:
        return 'critical';
      case AuditSeverity.HIGH:
        return 'error';
      case AuditSeverity.MEDIUM:
        return 'warning';
      case AuditSeverity.LOW:
        return 'info';
      default:
        return 'info';
    }
  }

  // ===========================================================================
  // DEAD LETTER QUEUE (DLQ) — Exhausted Retry Logging
  // ===========================================================================

  /**
   * Fires when a job fails (on every attempt, not just the final one).
   *
   * - Final failure (all retries exhausted): CRITICAL log with full payload
   * - Intermediate failure: WARN log for observability
   *
   * Without this listener, jobs that exhaust their retries would silently
   * sit in the Redis dead-letter set with no application-level visibility.
   */
  @OnWorkerEvent('failed')
  onJobFailed(job: Job<SecurityAlertJobPayload>, error: Error): void {
    const maxAttempts = job.opts?.attempts ?? 5;
    const isExhausted = job.attemptsMade >= maxAttempts;

    if (isExhausted) {
      // =====================================================================
      // CRITICAL: All retries exhausted — alert will NOT be delivered
      // =====================================================================
      this.logger.error(
        `[DLQ] SECURITY ALERT PERMANENTLY FAILED after ${job.attemptsMade}/${maxAttempts} attempts. ` +
          `Job=${job.id} AuditLog=${job.data.auditLogId} ` +
          `Org=${job.data.organizationId} Event=${job.data.eventType} ` +
          `Severity=${job.data.severity} Error="${error.message}"`,
      );
    } else {
      // Non-final failure — will be retried
      this.logger.warn(
        `[RETRY] Security alert attempt ${job.attemptsMade}/${maxAttempts} failed. ` +
          `Job=${job.id} AuditLog=${job.data.auditLogId} ` +
          `Error="${error.message}"`,
      );
    }
  }
}

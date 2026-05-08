/**
 * Purge Notifications Listener
 *
 * ARCHITECTURE:
 * Decoupled event listener for the purge.completed event.
 * The processor emits the event after each purge cycle; this listener
 * handles notification dispatch and audit logging independently.
 *
 * TWO HANDLERS, ONE EVENT:
 * 1. handlePurgeNotification() → Slack Block Kit message (Phase 3)
 * 2. handlePurgeAudit() → AuditLogsService compliance log (Phase 4)
 *
 * FAILURE ISOLATION:
 * If Slack is down or audit queue is full, the errors are caught and logged.
 * The purge job result is already committed — notification failures never
 * affect the purge outcome.
 *
 * CODEBASE PRECEDENT:
 * Follows the established EventEmitter2 pattern used by:
 * - SlackNotificationBridgeService (@OnEvent('issue.created'), etc.)
 * - WatchersListener (@OnEvent('issue.updated'), etc.)
 * - NotificationsListener (@OnEvent('invite.created'), etc.)
 *
 * @see SlackNotificationBridgeService for Slack Block Kit formatting convention
 * @see AuditLogsService for fire-and-forget audit logging
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { v4 as uuidV4 } from 'uuid';
import { SlackNotificationBridgeService } from '../integrations/services/slack-notification-bridge.service';
import { SlackMessage } from '../integrations/services/slack-integration.service';
import { AuditLogsService } from '../audit/audit-logs.service';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface';
import {
  PURGE_COMPLETED_EVENT,
  PurgeCompletedEvent,
  PurgeResult,
} from './purge.constants';

// =============================================================================
// SYSTEM ACTOR CONSTANT
// =============================================================================

/**
 * Actor ID used for system-initiated purge operations.
 * Distinguishes automated cron purges from admin-triggered purges in audit logs.
 */
const SYSTEM_PURGE_ACTOR = 'system:purge-scheduler' as const;

// =============================================================================
// LISTENER
// =============================================================================

@Injectable()
export class PurgeNotificationsListener {
  private readonly logger = new Logger(PurgeNotificationsListener.name);

  constructor(
    private readonly slackBridge: SlackNotificationBridgeService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ===========================================================================
  // HANDLER 1: Slack Notification (Phase 3)
  // ===========================================================================

  /**
   * Sends a Slack notification to each affected organization's configured channel.
   *
   * MULTI-TENANT ROUTING:
   * The purge batch may contain projects from multiple organizations.
   * Results are grouped by organizationId, and each org receives its own
   * Slack message via the established broadcastToOrganization() pattern.
   *
   * FAILURE HANDLING:
   * - If no Slack integration is configured for an org → silent skip (logged as debug)
   * - If Slack API fails → error logged, other orgs still notified
   * - Entire handler wrapped in try/catch → listener failure never propagates
   */
  @OnEvent(PURGE_COMPLETED_EVENT)
  async handlePurgeNotification(event: PurgeCompletedEvent): Promise<void> {
    try {
      const { results } = event;

      // Skip notification for empty purge cycles (no projects found)
      if (results.length === 0) {
        return;
      }

      // Group results by organization for per-tenant Slack routing
      const resultsByOrg = this.groupByOrganization(results);

      for (const [organizationId, orgResults] of resultsByOrg) {
        // Skip unknown orgs (e.g., manual purge of non-existent project)
        if (organizationId === 'UNKNOWN') {
          continue;
        }

        try {
          const message = this.buildSlackMessage(orgResults, event);
          await this.slackBridge.broadcastToOrganization(
            organizationId,
            message,
          );
        } catch (error) {
          // Per-org error isolation — continue with other orgs
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to send purge notification to org ${organizationId}: ${errMsg}`,
          );
        }
      }
    } catch (error) {
      // Top-level safety net — notification failure must never propagate
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Purge notification handler failed: ${errMsg}`);
    }
  }

  // ===========================================================================
  // HANDLER 2: Audit Logging (Phase 4)
  // ===========================================================================

  /**
   * Logs each purged project as an audit event for SOC2/ISO27001 compliance.
   *
   * One audit event per project (not per batch) because:
   * - Audit queries filter by resource_id (projectId) — one event = one record
   * - Each project may belong to a different organization (tenant isolation)
   * - Failed purges are also logged (action_type: 'DELETE', metadata.success: false)
   *
   * ACTOR RESOLUTION:
   * - Scheduled purge → actor_id = 'system:purge-scheduler'
   * - Admin manual purge → actor_id = UUID of the admin user
   */
  @OnEvent(PURGE_COMPLETED_EVENT)
  async handlePurgeAudit(event: PurgeCompletedEvent): Promise<void> {
    try {
      for (const result of event.results) {
        const auditEvent: AuditLogEvent = {
          event_uuid: uuidV4(),
          timestamp: new Date(),
          tenant_id: result.organizationId,
          actor_id: event.actorId,
          resource_type: 'Project',
          resource_id: result.projectId,
          action_type: 'DELETE',
          action: 'project.permanent_purge',
          metadata: {
            projectName: result.projectName,
            success: result.success,
            trigger: event.trigger,
            jobId: event.jobId,
            durationMs: result.durationMs,
            deletedCounts: result.deletedCounts,
            totalRowsDeleted: this.sumDeleteCounts(result),
            ...(result.error ? { error: result.error } : {}),
          },
        };

        await this.auditLogsService.log(auditEvent);
      }

      if (event.results.length > 0) {
        this.logger.log(
          `Logged ${event.results.length} purge audit events (trigger: ${event.trigger})`,
        );
      }
    } catch (error) {
      // Audit logging failure must never propagate — fire and forget
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Purge audit handler failed: ${errMsg}`);
    }
  }

  // ===========================================================================
  // SLACK MESSAGE BUILDER
  // ===========================================================================

  /**
   * Builds a Slack Block Kit message for a purge report.
   *
   * Design principles:
   * - Scannable in 5 seconds (header + summary counts)
   * - Color-coded status (✅/❌)
   * - Per-project breakdown with row counts and duration
   * - Error details for failed projects (actionable by ops)
   */
  private buildSlackMessage(
    results: ReadonlyArray<PurgeResult>,
    event: PurgeCompletedEvent,
  ): SlackMessage {
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const totalRows = results.reduce(
      (sum, r) => sum + this.sumDeleteCounts(r),
      0,
    );

    // Header — color-coded by success/failure
    const headerEmoji = failCount > 0 ? '⚠️' : '🗑️';
    const headerText =
      failCount > 0
        ? `${headerEmoji} Project Purge Report — ${failCount} failure(s)`
        : `${headerEmoji} Project Purge Report — All succeeded`;

    const blocks: Array<Record<string, unknown>> = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: headerText,
          emoji: true,
        },
      },
      // Summary section
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Projects Purged:*\n✅ ${successCount} succeeded  ❌ ${failCount} failed`,
          },
          {
            type: 'mrkdwn',
            text: `*Total Rows Deleted:*\n${totalRows.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${(event.totalDurationMs / 1000).toFixed(1)}s`,
          },
          {
            type: 'mrkdwn',
            text: `*Trigger:*\n${event.trigger === 'manual' ? `Manual (${event.actorId})` : 'Scheduled (03:00 UTC)'}`,
          },
        ],
      },
      { type: 'divider' },
    ];

    // Per-project breakdown (max 10 to stay within Slack block limits)
    const displayResults = results.slice(0, 10);
    for (const result of displayResults) {
      const statusIcon = result.success ? '✅' : '❌';
      const rowCount = this.sumDeleteCounts(result);
      const duration = (result.durationMs / 1000).toFixed(1);

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${statusIcon} *${result.projectName}*  •  ${rowCount.toLocaleString()} rows  •  ${duration}s${result.error ? `\n> _${result.error.substring(0, 150)}_` : ''}`,
        },
      });
    }

    // Overflow indicator
    if (results.length > 10) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_...and ${results.length - 10} more projects_`,
          },
        ],
      });
    }

    // Footer
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Job ID: \`${event.jobId}\` • ${new Date().toISOString()}`,
        },
      ],
    });

    return {
      channel: '', // broadcastToOrganization() resolves from integration config
      text: `Project Purge: ${successCount}/${results.length} succeeded (${totalRows.toLocaleString()} rows)`,
      blocks,
    };
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Group purge results by organizationId for per-tenant routing.
   */
  private groupByOrganization(
    results: ReadonlyArray<PurgeResult>,
  ): Map<string, PurgeResult[]> {
    const grouped = new Map<string, PurgeResult[]>();

    for (const result of results) {
      const orgId = result.organizationId;
      const existing = grouped.get(orgId);
      if (existing) {
        existing.push(result);
      } else {
        grouped.set(orgId, [result]);
      }
    }

    return grouped;
  }

  /**
   * Sum all deletion counts for a single project's purge result.
   */
  private sumDeleteCounts(result: PurgeResult): number {
    const counts = result.deletedCounts;
    return (
      counts.work_logs +
      counts.comments +
      counts.attachments +
      counts.issue_labels +
      counts.issue_components +
      counts.issue_links +
      counts.watchers +
      counts.ai_suggestions +
      counts.revisions_issue +
      counts.issues +
      counts.sprint_issues +
      counts.sprints +
      counts.board_columns +
      counts.boards +
      counts.webhook_logs +
      counts.webhooks +
      counts.project_members +
      counts.labels +
      counts.components +
      counts.custom_field_values +
      counts.custom_field_definitions +
      counts.document_segments +
      counts.documents +
      counts.resource_forecasts +
      counts.resource_allocations +
      counts.workflow_statuses +
      counts.onboarding_progress +
      counts.revisions_project +
      counts.projects
    );
  }
}

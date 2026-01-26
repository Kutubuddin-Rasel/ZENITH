import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  Integration,
  IntegrationStatus,
} from '../../integrations/entities/integration.entity';
import { CacheService } from '../../cache/cache.service';

/**
 * Alert severity levels for multi-channel routing
 */
export enum AlertSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Standardized alert payload for all channels
 */
export interface AlertPayload {
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Service for monitoring integration health and triggering alerts.
 *
 * Phase 1 - Common Module Remediation:
 * - Multi-channel notifications (Slack, PagerDuty, Email)
 * - Fire-and-forget pattern (never crashes main app)
 * - Configuration via environment variables
 *
 * Monitors:
 * - Integration health degradation (healthy → warning → error)
 * - Repeated sync failures
 * - Token refresh failures
 * - Long periods without successful sync
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  // ==========================================================================
  // ALERT CHANNEL CONFIGURATION (Phase 1 - Common Module Remediation)
  // Environment variables control which channels are enabled
  // ==========================================================================
  private readonly slackWebhookUrl: string | undefined;
  private readonly pagerDutyUrl: string | undefined;
  private readonly emailWebhookUrl: string | undefined;
  private readonly alertsEnabled: boolean;

  // Alert thresholds
  private readonly FAILURE_THRESHOLD = 3; // Alert after 3 consecutive failures
  private readonly STALE_SYNC_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours in ms

  // ==========================================================================
  // DISTRIBUTED FAILURE TRACKING (Phase 2 - Common Module Remediation)
  // Uses Redis for cluster-wide state instead of in-memory Map
  // ==========================================================================
  private readonly FAILURE_WINDOW_SECONDS = 600; // 10 minute rolling window
  private readonly FAILURE_KEY_PREFIX = 'alert:failures:';

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    @Optional() private configService?: ConfigService,
    @Optional() private cacheService?: CacheService,
  ) {
    // Load alert channel configuration
    this.slackWebhookUrl = this.configService?.get<string>(
      'SLACK_ALERT_WEBHOOK_URL',
    );
    this.pagerDutyUrl = this.configService?.get<string>('PAGERDUTY_ALERT_URL');
    this.emailWebhookUrl = this.configService?.get<string>(
      'EMAIL_ALERT_WEBHOOK_URL',
    );
    this.alertsEnabled =
      this.configService?.get<string>('ALERTS_ENABLED', 'true') === 'true';

    if (this.alertsEnabled) {
      const channels: string[] = [];
      if (this.slackWebhookUrl) channels.push('Slack');
      if (this.pagerDutyUrl) channels.push('PagerDuty');
      if (this.emailWebhookUrl) channels.push('Email');

      if (channels.length > 0) {
        this.logger.log(`Alert channels enabled: ${channels.join(', ')}`);
      } else {
        this.logger.warn(
          'No alert channels configured. Alerts will only be logged.',
        );
      }
    }

    if (this.cacheService) {
      this.logger.log('Distributed failure tracking enabled (Redis-backed)');
    } else {
      this.logger.warn('CacheService not available, failure tracking disabled');
    }
  }

  /**
   * Checks integration health and triggers alerts if degraded.
   * Called periodically by a cron job or after sync operations.
   */
  async checkIntegrationHealth(integrationId: string): Promise<void> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId },
    });

    if (!integration) {
      return;
    }

    // Check for health degradation
    if (integration.healthStatus === IntegrationStatus.ERROR) {
      this.alertHealthDegraded(integration, 'error');
    } else if (integration.healthStatus === IntegrationStatus.WARNING) {
      this.alertHealthDegraded(integration, 'warning');
    }

    // Check for repeated failures (distributed counter)
    const failures = await this.getFailureCount(integrationId);

    if (failures >= this.FAILURE_THRESHOLD) {
      this.alertRepeatedFailures(integration, failures);
    }

    // Check for stale syncs
    if (integration.lastSyncAt) {
      const timeSinceSync =
        Date.now() - new Date(integration.lastSyncAt).getTime();
      if (timeSinceSync > this.STALE_SYNC_THRESHOLD) {
        this.alertStaleSync(integration, timeSinceSync);
      }
    }
  }

  /**
   * Records a sync failure using distributed Redis counter.
   *
   * DISTRIBUTED STATE (Phase 2 - Common Module Remediation):
   * - Uses Redis INCR for atomic increment across all pods
   * - Rolling window: counter expires after 10 minutes of inactivity
   * - Returns new failure count for threshold checking
   */
  async recordSyncFailure(integrationId: string): Promise<number> {
    const key = `${this.FAILURE_KEY_PREFIX}${integrationId}`;

    // Use distributed counter if cache service is available
    if (this.cacheService) {
      const count = await this.cacheService.incrWithRollingWindow(
        key,
        this.FAILURE_WINDOW_SECONDS,
        { namespace: 'alerts' },
      );

      this.logger.warn(
        `Integration ${integrationId} has ${count} failures (distributed, 10min window)`,
      );

      return count;
    }

    // Fallback: just log (no tracking without cache service)
    this.logger.warn(
      `Integration ${integrationId} sync failed (tracking unavailable)`,
    );
    return 0;
  }

  /**
   * Records a sync success and resets the failure counter.
   *
   * DISTRIBUTED STATE: Deletes the Redis key so the counter resets to 0.
   */
  async recordSyncSuccess(integrationId: string): Promise<void> {
    const key = `${this.FAILURE_KEY_PREFIX}${integrationId}`;

    if (this.cacheService) {
      await this.cacheService.del(key, { namespace: 'alerts' });
      this.logger.debug(`Reset failure counter for ${integrationId}`);
    }
  }

  /**
   * Gets the current failure count for an integration.
   *
   * @param integrationId - Integration to check
   * @returns Current failure count from Redis (or 0 if not tracked)
   */
  async getFailureCount(integrationId: string): Promise<number> {
    const key = `${this.FAILURE_KEY_PREFIX}${integrationId}`;

    if (this.cacheService) {
      return this.cacheService.getCounter(key, { namespace: 'alerts' });
    }

    return 0;
  }

  /**
   * Triggers alert for health degradation.
   * Uses fire-and-forget pattern - never blocks or crashes main flow.
   */
  private alertHealthDegraded(
    integration: Integration,
    level: 'warning' | 'error',
  ): void {
    const severity =
      level === 'error' ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
    const emoji = level === 'error' ? '🔴 CRITICAL' : '⚠️ WARNING';

    // Always log (primary record)
    this.logger.error(
      `${emoji}: Integration health degraded for ${integration.name} (${integration.type})`,
    );

    const alertPayload: AlertPayload = {
      severity,
      title: `Integration Health Degraded: ${integration.name}`,
      message: `${integration.name} (${integration.type}) health status is ${level}`,
      context: {
        integrationId: integration.id,
        integrationType: integration.type,
        healthStatus: integration.healthStatus,
        lastError: integration.lastErrorMessage,
        lastErrorAt: integration.lastErrorAt,
      },
      timestamp: new Date().toISOString(),
    };

    // Log structured alert data
    this.logger.error(`Alert data: ${JSON.stringify(alertPayload, null, 2)}`);

    // Fire-and-forget: Send to all configured channels
    this.sendToAllChannels(alertPayload);
  }

  /**
   * Triggers alert for repeated failures.
   * Uses fire-and-forget pattern - never blocks or crashes main flow.
   */
  private alertRepeatedFailures(
    integration: Integration,
    failureCount: number,
  ): void {
    this.logger.error(
      `🔴 CRITICAL: Integration ${integration.name} has ${failureCount} consecutive sync failures`,
    );

    const alertPayload: AlertPayload = {
      severity: AlertSeverity.CRITICAL,
      title: `Repeated Sync Failures: ${integration.name}`,
      message: `${integration.name} has ${failureCount} consecutive sync failures`,
      context: {
        integrationId: integration.id,
        integrationType: integration.type,
        failureCount,
        lastError: integration.lastErrorMessage,
        lastErrorAt: integration.lastErrorAt,
      },
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`Alert data: ${JSON.stringify(alertPayload, null, 2)}`);

    // Fire-and-forget: Send to all configured channels
    this.sendToAllChannels(alertPayload);
  }

  /**
   * Triggers alert for stale sync (no sync for extended period).
   * Uses fire-and-forget pattern - never blocks or crashes main flow.
   */
  private alertStaleSync(
    integration: Integration,
    timeSinceSync: number,
  ): void {
    const hoursSinceSync = Math.floor(timeSinceSync / (60 * 60 * 1000));

    this.logger.warn(
      `⚠️ WARNING: Integration ${integration.name} hasn't synced in ${hoursSinceSync} hours`,
    );

    const alertPayload: AlertPayload = {
      severity: AlertSeverity.WARNING,
      title: `Stale Sync: ${integration.name}`,
      message: `${integration.name} hasn't synced in ${hoursSinceSync} hours`,
      context: {
        integrationId: integration.id,
        integrationType: integration.type,
        lastSyncAt: integration.lastSyncAt,
        hoursSinceSync,
      },
      timestamp: new Date().toISOString(),
    };

    this.logger.warn(`Alert data: ${JSON.stringify(alertPayload, null, 2)}`);

    // Fire-and-forget: Send to all configured channels
    this.sendToAllChannels(alertPayload);
  }

  /**
   * Gets alert summary for all integrations.
   */
  async getAlertSummary(): Promise<{
    total: number;
    critical: number;
    warning: number;
    healthy: number;
    alerts: Array<{
      integrationId: string;
      integrationType: string;
      severity: string;
      message: string;
    }>;
  }> {
    const integrations = await this.integrationRepo.find();

    const alerts: Array<{
      integrationId: string;
      integrationType: string;
      severity: string;
      message: string;
    }> = [];

    let critical = 0;
    let warning = 0;
    let healthy = 0;

    for (const integration of integrations) {
      if (
        integration.healthStatus === IntegrationStatus.ERROR ||
        integration.healthStatus === IntegrationStatus.DISCONNECTED
      ) {
        critical++;
        alerts.push({
          integrationId: integration.id,
          integrationType: integration.type,
          severity: 'critical',
          message:
            integration.lastErrorMessage || 'Integration is in error state',
        });
      } else if (integration.healthStatus === IntegrationStatus.WARNING) {
        warning++;
        alerts.push({
          integrationId: integration.id,
          integrationType: integration.type,
          severity: 'warning',
          message: 'Integration health is degraded',
        });
      } else {
        healthy++;
      }

      // Check for stale syncs
      if (integration.lastSyncAt) {
        const timeSinceSync =
          Date.now() - new Date(integration.lastSyncAt).getTime();
        if (timeSinceSync > this.STALE_SYNC_THRESHOLD) {
          const hoursSinceSync = Math.floor(timeSinceSync / (60 * 60 * 1000));
          alerts.push({
            integrationId: integration.id,
            integrationType: integration.type,
            severity: 'warning',
            message: `No sync in ${hoursSinceSync} hours`,
          });
        }
      }
    }

    return {
      total: integrations.length,
      critical,
      warning,
      healthy,
      alerts,
    };
  }

  // ==========================================================================
  // MULTI-CHANNEL NOTIFICATION SYSTEM (Phase 1 - Common Module Remediation)
  // Fire-and-forget pattern: Never crashes main app, logs all failures
  // ==========================================================================

  /**
   * Sends alert to all configured channels using Promise.allSettled.
   * Fire-and-forget: Errors are caught and logged, never thrown.
   */
  private sendToAllChannels(payload: AlertPayload): void {
    if (!this.alertsEnabled) {
      return;
    }

    // Build list of channel promises
    const channelPromises: Promise<void>[] = [];

    if (this.slackWebhookUrl) {
      channelPromises.push(this.sendToSlack(payload));
    }

    if (this.pagerDutyUrl && payload.severity === AlertSeverity.CRITICAL) {
      // Only page for CRITICAL alerts
      channelPromises.push(this.sendToPagerDuty(payload));
    }

    if (this.emailWebhookUrl) {
      channelPromises.push(this.sendToEmail(payload));
    }

    if (channelPromises.length === 0) {
      return;
    }

    // Fire-and-forget: Execute all in parallel, log results
    void Promise.allSettled(channelPromises).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        this.logger.warn(
          `Failed to send alert to ${failed.length}/${results.length} channels`,
        );
      }
    });
  }

  /**
   * Sends alert to Slack webhook.
   * Formats message using Slack Block Kit for rich formatting.
   */
  private async sendToSlack(payload: AlertPayload): Promise<void> {
    if (!this.slackWebhookUrl) return;

    const emoji = payload.severity === AlertSeverity.CRITICAL ? '🔴' : '⚠️';
    const color =
      payload.severity === AlertSeverity.CRITICAL ? '#FF0000' : '#FFA500';

    const slackPayload = {
      attachments: [
        {
          color,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `${emoji} ${payload.title}`,
                emoji: true,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: payload.message,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `*Severity:* ${payload.severity} | *Time:* ${payload.timestamp}`,
                },
              ],
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Slack responded with ${response.status}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send Slack alert: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error; // Re-throw for Promise.allSettled to catch
    }
  }

  /**
   * Sends alert to PagerDuty Events API v2.
   * Only triggered for CRITICAL severity alerts.
   */
  private async sendToPagerDuty(payload: AlertPayload): Promise<void> {
    if (!this.pagerDutyUrl) return;

    const pagerDutyPayload = {
      routing_key: this.configService?.get<string>('PAGERDUTY_ROUTING_KEY'),
      event_action: 'trigger',
      dedup_key: `zenith-${payload.title}-${Date.now()}`,
      payload: {
        summary: payload.title,
        source: 'Zenith AlertService',
        severity: 'critical',
        timestamp: payload.timestamp,
        custom_details: payload.context,
      },
    };

    try {
      const response = await fetch(this.pagerDutyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pagerDutyPayload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`PagerDuty responded with ${response.status}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send PagerDuty alert: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Sends alert to email webhook (e.g., SendGrid, Mailgun, or custom endpoint).
   */
  private async sendToEmail(payload: AlertPayload): Promise<void> {
    if (!this.emailWebhookUrl) return;

    const emailPayload = {
      subject: `[${payload.severity.toUpperCase()}] ${payload.title}`,
      body: payload.message,
      context: payload.context,
      timestamp: payload.timestamp,
    };

    try {
      const response = await fetch(this.emailWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailPayload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Email webhook responded with ${response.status}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send Email alert: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}

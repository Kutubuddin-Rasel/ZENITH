import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationGateway } from '../../../core/integrations/integration.gateway';
import {
  IAlertProvider,
  AlertProviderType,
  AlertPayload,
  AlertSeverity,
  SlackWebhookPayload,
} from '../interfaces/alert.interfaces';

// ---------------------------------------------------------------------------
// Slack Alert Provider
// ---------------------------------------------------------------------------

/**
 * SlackAlertProvider — Formats alerts as Slack Block Kit messages.
 *
 * ARCHITECTURE:
 * - HTTP POST to Slack Incoming Webhook URL
 * - Wrapped in IntegrationGateway circuit breaker for resilience
 * - Graceful degradation: if SLACK_WEBHOOK_URL is not configured,
 *   the provider is disabled (no-op) — does NOT crash the app
 *
 * SECRET MANAGEMENT:
 * Webhook URL loaded from ConfigService at construction.
 * Never hardcoded. Validated once at startup.
 */
@Injectable()
export class SlackAlertProvider implements IAlertProvider {
  readonly type = AlertProviderType.SLACK;
  private readonly logger = new Logger(SlackAlertProvider.name);

  private readonly webhookUrl: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly gateway: IntegrationGateway,
  ) {
    this.webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');

    if (!this.webhookUrl) {
      this.logger.warn(
        'SLACK_WEBHOOK_URL not configured — Slack alerts disabled',
      );
    } else {
      this.logger.log('Slack alert provider initialized');
    }
  }

  isEnabled(): boolean {
    return !!this.webhookUrl;
  }

  /**
   * Send alert to Slack via Incoming Webhook.
   *
   * CIRCUIT BREAKER: Wrapped in IntegrationGateway with:
   * - 5s timeout
   * - 50% error threshold
   * - 30s reset timeout
   * Throws on failure → BullMQ retries with exponential backoff.
   */
  async sendAlert(payload: AlertPayload): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.debug('Slack alerts disabled — skipping');
      return;
    }

    const slackPayload = this.formatPayload(payload);

    await this.gateway.execute(
      {
        name: 'slack-alerts',
        timeout: 5000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
      },
      async () => {
        const response = await fetch(this.webhookUrl as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackPayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Slack webhook failed (${response.status}): ${errorText}`,
          );
        }

        this.logger.log(`Slack alert sent for project ${payload.projectId}`);
      },
      () => {
        // Fallback: log when circuit is open
        this.logger.warn(
          `Slack circuit breaker OPEN — alert dropped for project ${payload.projectId}`,
        );
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Slack Block Kit Formatting
  // ---------------------------------------------------------------------------

  private formatPayload(payload: AlertPayload): SlackWebhookPayload {
    const severityEmoji = this.getSeverityEmoji(payload.severity);
    const fallbackText = `${severityEmoji} ${payload.title}: ${payload.message}`;

    return {
      text: fallbackText,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${severityEmoji} ${payload.title}`,
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
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Project:*\n${payload.projectName}`,
            },
            {
              type: 'mrkdwn',
              text: `*Risk Score:*\n${payload.metricValue} / 100`,
            },
            {
              type: 'mrkdwn',
              text: `*Threshold:*\n${payload.threshold}`,
            },
            {
              type: 'mrkdwn',
              text: `*Sprint:*\n${payload.sprintName ?? 'N/A'}`,
            },
          ],
        },
        { type: 'divider' },
      ],
    };
  }

  private getSeverityEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return '🚨';
      case AlertSeverity.WARNING:
        return '⚠️';
      case AlertSeverity.INFO:
        return 'ℹ️';
    }
  }
}

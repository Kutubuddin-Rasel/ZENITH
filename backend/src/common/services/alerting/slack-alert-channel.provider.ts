import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlertSeverity,
  type AlertPayload,
  type IAlertChannel,
} from '../../interfaces/alerting.interfaces';

/**
 * SlackAlertChannel — Strategy implementation for Slack webhooks.
 *
 * Filter: every severity (Slack is the team's default broadcast channel).
 * Payload format: Slack Block Kit with severity-coloured attachment.
 * If `SLACK_ALERT_WEBHOOK_URL` is unset, `send` is a no-op (returns void)
 * so the dispatcher can fan out unconditionally without dispatcher-side
 * config branching.
 */
@Injectable()
export class SlackAlertChannel implements IAlertChannel {
  readonly name = 'slack';
  readonly severityFilter: ReadonlyArray<AlertSeverity> = [
    AlertSeverity.DEBUG,
    AlertSeverity.INFO,
    AlertSeverity.WARNING,
    AlertSeverity.ERROR,
    AlertSeverity.CRITICAL,
  ];

  private readonly logger = new Logger(SlackAlertChannel.name);
  private readonly webhookUrl: string | undefined;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.webhookUrl = this.configService?.get<string>(
      'SLACK_ALERT_WEBHOOK_URL',
    );
  }

  async send(payload: AlertPayload): Promise<void> {
    if (!this.webhookUrl) return;

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
              text: { type: 'mrkdwn', text: payload.message },
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

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const err = `Slack responded with ${response.status}`;
      this.logger.error(`Failed to send Slack alert: ${err}`);
      throw new Error(err);
    }
  }
}

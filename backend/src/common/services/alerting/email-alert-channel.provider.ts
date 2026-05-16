import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlertSeverity,
  type AlertPayload,
  type IAlertChannel,
} from '../../interfaces/alerting.interfaces';

/**
 * EmailAlertChannel — Strategy implementation for email-via-webhook
 * delivery (SendGrid, Mailgun, or any custom HTTP transport).
 *
 * Filter: WARNING+ (skip DEBUG/INFO to avoid noise).
 * If `EMAIL_ALERT_WEBHOOK_URL` is unset, `send` is a no-op.
 */
@Injectable()
export class EmailAlertChannel implements IAlertChannel {
  readonly name = 'email';
  readonly severityFilter: ReadonlyArray<AlertSeverity> = [
    AlertSeverity.WARNING,
    AlertSeverity.ERROR,
    AlertSeverity.CRITICAL,
  ];

  private readonly logger = new Logger(EmailAlertChannel.name);
  private readonly webhookUrl: string | undefined;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.webhookUrl = this.configService?.get<string>(
      'EMAIL_ALERT_WEBHOOK_URL',
    );
  }

  async send(payload: AlertPayload): Promise<void> {
    if (!this.webhookUrl) return;

    const emailPayload = {
      subject: `[${payload.severity.toUpperCase()}] ${payload.title}`,
      body: payload.message,
      context: payload.context,
      timestamp: payload.timestamp,
    };

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const err = `Email webhook responded with ${response.status}`;
      this.logger.error(`Failed to send Email alert: ${err}`);
      throw new Error(err);
    }
  }
}

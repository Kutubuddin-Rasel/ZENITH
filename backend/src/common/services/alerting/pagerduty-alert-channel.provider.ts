import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlertSeverity,
  type AlertPayload,
  type IAlertChannel,
} from '../../interfaces/alerting.interfaces';

/**
 * PagerDutyAlertChannel — Strategy implementation for PagerDuty Events API v2.
 *
 * Filter: CRITICAL only (paging is reserved for breaks-the-business events).
 * Payload format: PagerDuty `trigger` event with deduplication key.
 * If `PAGERDUTY_ALERT_URL` is unset, `send` is a no-op.
 */
@Injectable()
export class PagerDutyAlertChannel implements IAlertChannel {
  readonly name = 'pagerduty';
  readonly severityFilter: ReadonlyArray<AlertSeverity> = [
    AlertSeverity.CRITICAL,
  ];

  private readonly logger = new Logger(PagerDutyAlertChannel.name);
  private readonly url: string | undefined;
  private readonly routingKey: string | undefined;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.url = this.configService?.get<string>('PAGERDUTY_ALERT_URL');
    this.routingKey = this.configService?.get<string>('PAGERDUTY_ROUTING_KEY');
  }

  async send(payload: AlertPayload): Promise<void> {
    if (!this.url) return;

    const pagerDutyPayload = {
      routing_key: this.routingKey,
      event_action: 'trigger',
      dedup_key: `zenith-${payload.title}-${Date.now()}`,
      payload: {
        summary: payload.title,
        source: 'Zenith Alerting',
        severity: 'critical',
        timestamp: payload.timestamp,
        custom_details: payload.context,
      },
    };

    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pagerDutyPayload),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const err = `PagerDuty responded with ${response.status}`;
      this.logger.error(`Failed to send PagerDuty alert: ${err}`);
      throw new Error(err);
    }
  }
}

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ALERT_CHANNEL_TOKEN } from '../../constants/alerting.tokens';
import type {
  AlertPayload,
  IAlertChannel,
  IAlertDispatcher,
} from '../../interfaces/alerting.interfaces';

/**
 * AlertDispatcher
 *
 * SRP: Fan-out a payload to every channel whose `severityFilter` matches,
 * via `Promise.allSettled` (fire-and-forget). Never throws to the caller —
 * transport failures are aggregated into a single warning log line.
 *
 * OCP: Adding a new transport is a two-step registration in
 * `CommonAlertingModule` — register the channel class as a provider, then
 * append it to the `ALERT_CHANNEL_TOKEN` factory's `inject` + return
 * tuple. The dispatcher requires no changes.
 *
 * `ALERTS_ENABLED=false` short-circuits dispatch entirely (useful for
 * test environments and on-call hand-offs).
 */
@Injectable()
export class AlertDispatcher implements IAlertDispatcher {
  private readonly logger = new Logger(AlertDispatcher.name);
  private readonly alertsEnabled: boolean;

  constructor(
    @Optional()
    @Inject(ALERT_CHANNEL_TOKEN)
    private readonly channels: IAlertChannel[] = [],
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.alertsEnabled =
      this.configService?.get<string>('ALERTS_ENABLED', 'true') === 'true';

    if (this.alertsEnabled && this.channels.length > 0) {
      this.logger.log(
        `Alert channels enabled: ${this.channels.map((c) => c.name).join(', ')}`,
      );
    } else if (this.alertsEnabled) {
      this.logger.warn(
        'No alert channels configured. Alerts will only be logged.',
      );
    }
  }

  dispatch(payload: AlertPayload): void {
    if (!this.alertsEnabled || this.channels.length === 0) return;

    const eligible = this.channels.filter((channel) =>
      channel.severityFilter.includes(payload.severity),
    );
    if (eligible.length === 0) return;

    void Promise.allSettled(
      eligible.map((channel) => channel.send(payload)),
    ).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        this.logger.warn(
          `Failed to send alert to ${failed.length}/${results.length} channels`,
        );
      }
    });
  }
}

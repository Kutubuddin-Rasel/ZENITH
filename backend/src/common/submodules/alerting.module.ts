import { Module } from '@nestjs/common';
import { CacheModule } from '../../cache/cache.module';
import {
  ALERT_CHANNEL_TOKEN,
  ALERT_DISPATCHER_TOKEN,
  FAILURE_TRACKER_TOKEN,
} from '../constants/alerting.tokens';
import { IAlertChannel } from '../interfaces/alerting.interfaces';
import { AlertDispatcher } from '../services/alerting/alert-dispatcher.service';
import { EmailAlertChannel } from '../services/alerting/email-alert-channel.provider';
import { PagerDutyAlertChannel } from '../services/alerting/pagerduty-alert-channel.provider';
import { RedisFailureTrackerProvider } from '../services/alerting/redis-failure-tracker.provider';
import { SlackAlertChannel } from '../services/alerting/slack-alert-channel.provider';

/**
 * CommonAlertingModule
 *
 * SRP: Owns the multi-channel alerting infrastructure. NestJS does not
 * support Angular-style `multi: true`, so the channel collection is
 * aggregated by a single `useFactory` that injects each concrete channel
 * provider and returns them as `IAlertChannel[]`. The dispatcher receives
 * the array via `@Inject(ALERT_CHANNEL_TOKEN)` (Strategy collection — OCP).
 *
 * To register a new channel: add the concrete provider class to `providers`
 * and append it to the factory's `inject` array + return tuple. No edits
 * to the dispatcher are required.
 *
 * Integration-domain orchestration (querying `Repository<Integration>`,
 * building integration-specific payloads) lives in
 * `IntegrationAlertService` inside the `integrations` module — this
 * submodule has ZERO dependency on the `Integration` entity.
 */
@Module({
  imports: [CacheModule],
  providers: [
    RedisFailureTrackerProvider,
    SlackAlertChannel,
    PagerDutyAlertChannel,
    EmailAlertChannel,
    AlertDispatcher,

    {
      provide: ALERT_CHANNEL_TOKEN,
      useFactory: (
        slack: SlackAlertChannel,
        pagerduty: PagerDutyAlertChannel,
        email: EmailAlertChannel,
      ): IAlertChannel[] => [slack, pagerduty, email],
      inject: [SlackAlertChannel, PagerDutyAlertChannel, EmailAlertChannel],
    },

    {
      provide: FAILURE_TRACKER_TOKEN,
      useExisting: RedisFailureTrackerProvider,
    },
    { provide: ALERT_DISPATCHER_TOKEN, useExisting: AlertDispatcher },
  ],
  exports: [ALERT_DISPATCHER_TOKEN, FAILURE_TRACKER_TOKEN, ALERT_CHANNEL_TOKEN],
})
export class CommonAlertingModule {}

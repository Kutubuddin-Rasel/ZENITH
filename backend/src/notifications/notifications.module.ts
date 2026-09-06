import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { BriefingService } from './services/briefing.service';
import { DailyDigestProcessor } from './processors/daily-digest.processor';
import { NotificationsConsumer } from './processors/notifications.consumer';
import { ConfigModule } from '@nestjs/config';
// REMOVED: UsersModule - using UsersCoreModule (global) for UsersService
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsListener } from './notifications.listener';
import { AchievementNotificationListener } from './listeners/achievement-notification.listener';
import { AnalyticsAlertListener } from './listeners/analytics-alert.listener';
// REMOVED: AuthModule - guards are global via APP_GUARD
import { CacheModule } from '../cache/cache.module';
import { EmailModule } from '../email/email.module';
import { SmartDigestService } from './services/smart-digest.service';
import { SnoozeWorker } from './processors/snooze.worker';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationQueryService } from './services/notification-query.service';
import { NotificationCommandService } from './services/notification-command.service';
import { TypeormNotificationRepository } from './repositories/typeorm-notification.repository';
import { EmailNotificationAdapter } from './adapters/email-notification.adapter';
import { RealtimeTransportPort } from './ports/realtime-transport.port';
import { EmailTransportPort } from './ports/email-transport.port';
import {
  NOTIFICATION_INBOX_TOKEN,
  NOTIFICATION_ROUTER_TOKEN,
  NOTIFICATION_REPOSITORY_TOKEN,
} from './constants/notifications.tokens';

/**
 * STEP 2 — CQRS + DIP wiring.
 *
 * Concrete classes register as bare providers FIRST (so `useExisting` can alias
 * them); the public tokens then map onto those instances. Every cross-cutting
 * dependency is inverted:
 *  - persistence  → `NOTIFICATION_REPOSITORY_TOKEN` (`useClass` —
 *    `TypeormNotificationRepository`, the ClickHouse/raw-SQL swap seam).
 *  - real-time    → `RealtimeTransportPort` (`useExisting` the gateway, which now
 *    `extends RealtimeTransportPort`); the command service never touches Socket.io.
 *  - email        → `EmailTransportPort` (`useClass` — `EmailNotificationAdapter`,
 *    an L4 forward seam, injected nowhere; `EmailModule` exports `EmailService`).
 *
 * SEALED (Step 3): the `NotificationsService` god class is deleted; the module
 * exports ONLY the read/write token facades. Every internal (CQRS services,
 * repository, ports, gateway, listeners, workers, entity) is reachable solely
 * through `index.ts` + the `NOTIFICATIONS_DEEP_IMPORT_PATTERNS` lint boundary.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    ConfigModule,
    CacheModule,
    EmailModule,
    ScheduleModule.forRoot(),
    // Queue registration now in CoreQueueModule (global)
  ],
  providers: [
    // CQRS services + persistence/transport adapters (bare = aliasable).
    NotificationQueryService,
    NotificationCommandService,
    TypeormNotificationRepository,
    EmailNotificationAdapter,
    // DIP bindings — public tokens / abstract ports onto the concrete impls.
    {
      provide: NOTIFICATION_REPOSITORY_TOKEN,
      useClass: TypeormNotificationRepository,
    },
    {
      provide: NOTIFICATION_INBOX_TOKEN,
      useExisting: NotificationQueryService,
    },
    {
      provide: NOTIFICATION_ROUTER_TOKEN,
      useExisting: NotificationCommandService,
    },
    { provide: RealtimeTransportPort, useExisting: NotificationsGateway },
    { provide: EmailTransportPort, useClass: EmailNotificationAdapter },
    // Transport + listeners + workers.
    NotificationsGateway,
    NotificationsListener,
    AchievementNotificationListener,
    AnalyticsAlertListener,
    BriefingService,
    SmartDigestService,
    DailyDigestProcessor,
    NotificationsConsumer,
    SnoozeWorker,
  ],
  controllers: [NotificationsController],
  // Public surface only — the read/write token facades. `SmartDigestService`
  // (verified zero external consumers) and the deleted god class are no longer
  // exported; cross-module consumers inject the tokens via the `index.ts` barrel.
  exports: [NOTIFICATION_INBOX_TOKEN, NOTIFICATION_ROUTER_TOKEN],
})
export class NotificationsModule {}

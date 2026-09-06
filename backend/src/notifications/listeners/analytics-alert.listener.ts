// src/notifications/listeners/analytics-alert.listener.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ANALYTICS_EVENTS,
  type AnalyticsStallAlertEvent,
} from '../../analytics';
import { NotificationType } from '../entities/notification.entity';
import { INotificationRouter } from '../interfaces/notifications.interfaces';
import { NOTIFICATION_ROUTER_TOKEN } from '../constants/notifications.tokens';

/**
 * Bridges analytics' `STALL_ALERT` domain event into an in-app notification.
 *
 * Replaces the former synchronous `AnalyticsAggregationJobService →
 * NotificationsService.createMany(...)` write (the last Level-3 ↔ Level-3
 * coupling). The listener lives in the notifications module because it depends
 * on `NOTIFICATION_ROUTER_TOKEN`, which analytics intentionally cannot reach.
 *
 * Mirrors `NotificationsListener` / `AchievementNotificationListener`: wraps the
 * dispatch in try/catch + logger so a handler failure never propagates back
 * into the EventEmitter2 emit loop.
 */
@Injectable()
export class AnalyticsAlertListener {
  private readonly logger = new Logger(AnalyticsAlertListener.name);

  constructor(
    @Inject(NOTIFICATION_ROUTER_TOKEN)
    private readonly router: INotificationRouter,
  ) {}

  @OnEvent(ANALYTICS_EVENTS.STALL_ALERT)
  async handleStallAlert(payload: AnalyticsStallAlertEvent): Promise<void> {
    try {
      await this.router.createMany(
        payload.userIds,
        payload.message,
        payload.context,
        NotificationType.WARNING,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create stall-alert notification: ${(error as Error).message}`,
      );
    }
  }
}

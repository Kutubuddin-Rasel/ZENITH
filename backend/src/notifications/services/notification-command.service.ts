// src/notifications/services/notification-command.service.ts
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  NotificationStatus,
  NotificationType,
} from '../entities/notification.entity';
import {
  INotificationRepository,
  INotificationRouter,
  NotificationView,
} from '../interfaces/notifications.interfaces';
import { NOTIFICATION_REPOSITORY_TOKEN } from '../constants/notifications.tokens';
import { RealtimeTransportPort } from '../ports/realtime-transport.port';
import { SmartDigestService } from './smart-digest.service';
import { toNotificationView } from './notification-view.mapper';

/**
 * CQRS write side — `INotificationRouter`, bound to `NOTIFICATION_ROUTER_TOKEN`.
 *
 * Orchestrates persistence (`INotificationRepository`) + real-time delivery
 * (`RealtimeTransportPort`) + INFO digest staging (`SmartDigestService`). The
 * god class's transport leak is gone: every socket emit goes through the port,
 * never a concrete gateway.
 *
 * `forwardRef(SmartDigestService)`: the INFO-staging branch and the digest
 * flush (`processDigest → createMany`) form a mutual dependency, mirroring the
 * original god-class ↔ SmartDigest cycle.
 */
@Injectable()
export class NotificationCommandService implements INotificationRouter {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY_TOKEN)
    private readonly repo: INotificationRepository,
    private readonly realtime: RealtimeTransportPort,
    @Inject(forwardRef(() => SmartDigestService))
    private readonly smartDigest: SmartDigestService,
  ) {}

  async createMany(
    userIds: string[],
    message: string,
    context: Record<string, unknown> = {},
    type: NotificationType = NotificationType.INFO,
  ): Promise<NotificationView[]> {
    // Smart Digest: batch low-priority (INFO) notifications — stage, don't persist.
    if (type === NotificationType.INFO) {
      for (const uid of userIds) {
        await this.smartDigest.stageNotification(uid, {
          message,
          context,
          type,
          createdAt: new Date(),
        });
      }
      return [];
    }

    const entities = this.repo.createEntities(userIds, message, context, type);
    const saved = await this.repo.save(entities);
    for (const n of saved) {
      this.realtime.sendToUser(n.userId, {
        id: n.id,
        message: n.message,
        context: n.context as Record<string, unknown>,
        type: n.type,
        createdAt: n.createdAt,
      });
    }
    return saved.map(toNotificationView);
  }

  async markStatus(
    userId: string,
    notifId: string,
    status: NotificationStatus,
  ): Promise<void> {
    const notification = await this.repo.findOneForUser(userId, notifId);
    if (!notification) return;

    notification.status = status;
    // Sync the legacy `read` boolean for backwards compatibility.
    notification.read = status === NotificationStatus.DONE;

    await this.repo.saveOne(notification);
  }

  async archiveAll(userId: string): Promise<void> {
    await this.repo.archiveAllUnread(userId);
  }

  async archive(userId: string, notifId: string): Promise<void> {
    await this.repo.archiveOne(userId, notifId);
  }

  async snooze(
    userId: string,
    notifId: string,
    hours: number,
  ): Promise<NotificationView | null> {
    const notification = await this.repo.findOneForUser(userId, notifId);
    if (!notification) return null;

    const snoozedUntil = new Date();
    snoozedUntil.setHours(snoozedUntil.getHours() + hours);

    notification.status = NotificationStatus.SNOOZED;
    notification.snoozedUntil = snoozedUntil;

    await this.repo.saveOne(notification);
    return toNotificationView(notification);
  }

  async unsnooze(notifId: string): Promise<NotificationView | null> {
    const notification = await this.repo.findById(notifId);
    if (!notification) return null;

    notification.status = NotificationStatus.UNREAD;
    notification.snoozedUntil = undefined;
    notification.read = false;

    await this.repo.saveOne(notification);

    // Notify the user via WebSocket that the notification is back.
    this.realtime.sendToUser(notification.userId, {
      id: notification.id,
      message: notification.message,
      context: notification.context as Record<string, unknown>,
      type: notification.type,
      createdAt: notification.createdAt,
      unsnoozed: true,
    });

    return toNotificationView(notification);
  }

  async deleteByContext(
    userId: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const ids = await this.repo.deleteByContext(userId, context);
    if (ids.length > 0) {
      this.realtime.sendDeletionToUser(userId, ids);
    }
  }

  async deleteByMessageContent(userId: string, pattern: string): Promise<void> {
    const ids = await this.repo.deleteByMessageLike(userId, pattern);
    if (ids.length > 0) {
      this.realtime.sendDeletionToUser(userId, ids);
    }
  }
}

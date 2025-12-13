// src/notifications/notifications.service.ts
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Notification,
  NotificationType,
  NotificationStatus,
} from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import { SmartDigestService } from './services/smart-digest.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
    private gateway: NotificationsGateway,
    @Inject(forwardRef(() => SmartDigestService))
    private smartDigestService: SmartDigestService,
  ) {}

  /** Create a notification for multiple users */
  async createMany(
    userIds: string[],
    message: string,
    context: Record<string, unknown> = {},
    type: NotificationType = NotificationType.INFO,
  ): Promise<Notification[]> {
    // Smart Digest: Batch low priority notifications (INFO)
    if (type === NotificationType.INFO) {
      for (const uid of userIds) {
        await this.smartDigestService.stageNotification(uid, {
          message,
          context,
          type,
          createdAt: new Date(),
        });
      }
      return []; // Return empty as we didn't persist yet
    }

    const notifs = userIds.map((uid) =>
      this.repo.create({ userId: uid, message, context, type }),
    );
    const saved = await this.repo.save(notifs);
    for (const n of saved) {
      this.gateway.sendToUser(n.userId, {
        id: n.id,
        message: n.message,
        context: n.context as Record<string, unknown>,
        type: n.type,
        createdAt: n.createdAt,
      });
    }
    return saved;
  }

  /** List unread notifications for one user */
  async listForUser(
    userId: string,
    status: NotificationStatus = NotificationStatus.UNREAD,
  ): Promise<Notification[]> {
    const notifications = await this.repo.find({
      where: { userId, status },
      order: { createdAt: 'DESC' },
    });

    if (!Array.isArray(notifications)) return [];
    return notifications;
  }

  /** List all notifications for one user (both read and unread) */
  async listAllForUser(userId: string): Promise<Notification[]> {
    const notifications = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (!Array.isArray(notifications)) return [];
    return notifications;
  }

  /** Mark a notification status (DONE, SAVED, UNREAD) */
  async markStatus(
    userId: string,
    notifId: string,
    status: NotificationStatus,
  ): Promise<void> {
    const notification = await this.repo.findOne({
      where: { id: notifId, userId },
    });

    if (!notification) return;

    notification.status = status;
    // Sync read boolean for legacy support
    notification.read = status === NotificationStatus.DONE;

    await this.repo.save(notification);
  }

  /** Inbox Zero: Archive all unread notifications */
  async archiveAll(userId: string): Promise<void> {
    await this.repo.update(
      { userId, status: NotificationStatus.UNREAD },
      { status: NotificationStatus.DONE, read: true },
    );
  }

  /**
   * OPTIMIZED: Delete notifications by context using JSONB containment operator
   * Uses PostgreSQL @> operator for database-level filtering instead of in-memory
   */
  async deleteByContext(
    userId: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    // OPTIMIZED: Use JSONB @> (contains) operator for efficient database-level filtering
    // This replaces: fetch all → filter in memory → delete
    // With: single query that filters AND returns matching IDs
    const matchingNotifications = await this.repo
      .createQueryBuilder('notification')
      .select(['notification.id'])
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.context @> :context::jsonb', {
        context: JSON.stringify(context),
      })
      .getMany();

    if (matchingNotifications.length > 0) {
      const notificationIds = matchingNotifications.map((n) => n.id);
      await this.repo.delete(notificationIds);

      // Send WebSocket deletion event
      this.gateway.sendDeletionToUser(userId, notificationIds);
    }
  }

  /** Delete notifications by message content (fallback for invitation cleanup) */
  async deleteByMessageContent(
    userId: string,
    messagePattern: string,
  ): Promise<void> {
    const notifications = await this.repo.find({
      where: { userId, status: NotificationStatus.UNREAD },
    });

    const matchingNotifications = notifications.filter((n) =>
      n.message.includes(messagePattern),
    );

    if (matchingNotifications.length > 0) {
      const notificationIds = matchingNotifications.map((n) => n.id);
      await this.repo.delete(notificationIds);

      // Send WebSocket deletion event
      this.gateway.sendDeletionToUser(userId, notificationIds);
    }
  }

  /** Inbox Zero: Snooze a notification for specified hours */
  async snooze(
    userId: string,
    notifId: string,
    hours: number,
  ): Promise<Notification | null> {
    const notification = await this.repo.findOne({
      where: { id: notifId, userId },
    });

    if (!notification) return null;

    const snoozedUntil = new Date();
    snoozedUntil.setHours(snoozedUntil.getHours() + hours);

    notification.status = NotificationStatus.SNOOZED;
    notification.snoozedUntil = snoozedUntil;

    await this.repo.save(notification);

    return notification;
  }

  /** Inbox Zero: Archive a single notification */
  async archive(userId: string, notifId: string): Promise<void> {
    await this.repo.update(
      { id: notifId, userId },
      { status: NotificationStatus.ARCHIVED, read: true },
    );
  }

  /** Unsnooze a notification (called by scheduled job or when snooze expires) */
  async unsnooze(notifId: string): Promise<Notification | null> {
    const notification = await this.repo.findOne({
      where: { id: notifId },
    });

    if (!notification) return null;

    notification.status = NotificationStatus.UNREAD;
    notification.snoozedUntil = undefined;
    notification.read = false;

    await this.repo.save(notification);

    // Notify user via WebSocket that notification is back
    this.gateway.sendToUser(notification.userId, {
      id: notification.id,
      message: notification.message,
      context: notification.context as Record<string, unknown>,
      type: notification.type,
      createdAt: notification.createdAt,
      unsnoozed: true,
    });

    return notification;
  }

  /** Get snoozed notifications that are due to be unsnoozed */
  async getDueSnoozedNotifications(): Promise<Notification[]> {
    const now = new Date();
    return this.repo
      .createQueryBuilder('notification')
      .where('notification.status = :status', {
        status: NotificationStatus.SNOOZED,
      })
      .andWhere('notification.snoozedUntil <= :now', { now })
      .getMany();
  }

  /** Get notification by ID */
  async findOne(id: string): Promise<Notification | null> {
    return this.repo.findOne({ where: { id } });
  }
}

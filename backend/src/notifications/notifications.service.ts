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
import {
  CursorPaginatedResult,
  decodeCursor,
  encodeCursor,
} from './dto/cursor-pagination.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
    private gateway: NotificationsGateway,
    @Inject(forwardRef(() => SmartDigestService))
    private smartDigestService: SmartDigestService,
  ) { }

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

  /**
   * List notifications for one user (legacy - unbounded)
   *
   * SECURITY (Phase 6): Optional organizationId for tenant scoping
   */
  async listForUser(
    userId: string,
    status: NotificationStatus = NotificationStatus.UNREAD,
    organizationId?: string,
  ): Promise<Notification[]> {
    const where: any = { userId, status };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const notifications = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
    });

    if (!Array.isArray(notifications)) return [];
    return notifications;
  }

  /**
   * SECURITY (Phase 4 + Phase 6): Cursor-based pagination with tenant scoping
   *
   * Uses composite keyset (createdAt, id) for:
   * - O(1) performance regardless of history size
   * - No duplicate items in live feeds (stable anchor)
   * - Same-millisecond collision handling
   * - Optional organizationId for multi-tenant isolation
   */
  async listForUserWithCursor(
    userId: string,
    status: NotificationStatus = NotificationStatus.UNREAD,
    cursor?: string,
    limit: number = 20,
    organizationId?: string,
  ): Promise<CursorPaginatedResult<Notification>> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .andWhere('n.status = :status', { status })
      .orderBy('n.createdAt', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .take(safeLimit + 1); // Fetch one extra to check for next page

    // SECURITY (Phase 6): Apply tenant scoping if organizationId provided
    if (organizationId) {
      qb.andWhere('n.organizationId = :organizationId', { organizationId });
    }

    // Apply cursor-based filtering (keyset pagination)
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        // Composite key comparison: (createdAt, id) < (lastCreatedAt, lastId)
        qb.andWhere(
          '(n.createdAt < :lastCreatedAt OR (n.createdAt = :lastCreatedAt AND n.id < :lastId))',
          {
            lastCreatedAt: new Date(decoded.createdAt),
            lastId: decoded.id,
          },
        );
      }
    }

    const results = await qb.getMany();

    // Check if there's a next page
    const hasNextPage = results.length > safeLimit;
    const data = hasNextPage ? results.slice(0, safeLimit) : results;

    // Generate next cursor from last item
    const nextCursor =
      hasNextPage && data.length > 0
        ? encodeCursor(data[data.length - 1].createdAt, data[data.length - 1].id)
        : null;

    return { data, nextCursor };
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

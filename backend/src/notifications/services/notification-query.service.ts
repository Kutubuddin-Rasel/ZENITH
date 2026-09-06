// src/notifications/services/notification-query.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { NotificationStatus } from '../entities/notification.entity';
import {
  CursorPaginatedResult,
  INotificationInbox,
  INotificationRepository,
  NotificationView,
} from '../interfaces/notifications.interfaces';
import { NOTIFICATION_REPOSITORY_TOKEN } from '../constants/notifications.tokens';
import { toNotificationView } from './notification-view.mapper';

/**
 * CQRS read side — `INotificationInbox`, bound to `NOTIFICATION_INBOX_TOKEN`.
 *
 * Pure queries over `INotificationRepository`, mapping entities →
 * `NotificationView`. No writes, no transport. Consumed by the controller GET
 * routes, the snooze worker (due sweep), and the dashboard module.
 */
@Injectable()
export class NotificationQueryService implements INotificationInbox {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY_TOKEN)
    private readonly repo: INotificationRepository,
  ) {}

  async listForUser(
    userId: string,
    status: NotificationStatus = NotificationStatus.UNREAD,
    organizationId?: string,
  ): Promise<NotificationView[]> {
    const rows = await this.repo.findForUser(userId, status, organizationId);
    return rows.map(toNotificationView);
  }

  async listForUserWithCursor(
    userId: string,
    status: NotificationStatus = NotificationStatus.UNREAD,
    cursor?: string,
    limit = 20,
    organizationId?: string,
  ): Promise<CursorPaginatedResult<NotificationView>> {
    const page = await this.repo.findFeedKeyset(
      userId,
      status,
      cursor,
      limit,
      organizationId,
    );
    return {
      data: page.data.map(toNotificationView),
      nextCursor: page.nextCursor,
    };
  }

  async listAllForUser(userId: string): Promise<NotificationView[]> {
    const rows = await this.repo.findAllForUser(userId);
    return rows.map(toNotificationView);
  }

  async findOne(id: string): Promise<NotificationView | null> {
    const row = await this.repo.findById(id);
    return row ? toNotificationView(row) : null;
  }

  async getDueSnoozedNotifications(): Promise<NotificationView[]> {
    const rows = await this.repo.findDueSnoozed(new Date());
    return rows.map(toNotificationView);
  }
}

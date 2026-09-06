// src/notifications/notifications.controller.ts
import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Request,
  Query,
  Body,
  Post,
  ParseUUIDPipe,
  Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { StatefulCsrfGuard } from '../security/csrf';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import {
  NotificationType,
  NotificationStatus,
} from './entities/notification.entity';
import { UpdateNotificationStatusDto } from './dto/update-notification-status.dto';
import { CursorPaginationDto } from './dto/cursor-pagination.dto';
import {
  NOTIFICATION_INBOX_TOKEN,
  NOTIFICATION_ROUTER_TOKEN,
} from './constants/notifications.tokens';
import {
  INotificationInbox,
  INotificationRouter,
} from './interfaces/notifications.interfaces';

/**
 * SECURITY (Phase 2): CSRF Protection
 * Prevents alert suppression attacks where attackers hide security notifications
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class NotificationsController {
  constructor(
    @Inject(NOTIFICATION_INBOX_TOKEN)
    private readonly inbox: INotificationInbox,
    @Inject(NOTIFICATION_ROUTER_TOKEN)
    private readonly router: INotificationRouter,
  ) {}

  /** Get current user's unread notifications (legacy) */
  @RequirePermission('notifications:view')
  @Get()
  async list(
    @Request() req: { user: JwtRequestUser },
    @Query('status') status?: NotificationStatus,
  ) {
    return this.inbox.listForUser(req.user.userId, status);
  }

  /**
   * SECURITY (Phase 4): Cursor-based pagination for notification feed
   * - Scalable O(1) performance
   * - No duplicate items in live feeds
   */
  @RequirePermission('notifications:view')
  @Get('feed')
  async listWithCursor(
    @Request() req: { user: JwtRequestUser },
    @Query() query: CursorPaginationDto,
    @Query('status') status?: NotificationStatus,
  ) {
    return this.inbox.listForUserWithCursor(
      req.user.userId,
      status || NotificationStatus.UNREAD,
      query.cursor,
      query.limit,
    );
  }

  /** Get current user's all notifications (both read and unread) */
  @RequirePermission('notifications:view')
  @Get('all')
  async listAll(@Request() req: { user: JwtRequestUser }) {
    return this.inbox.listAllForUser(req.user.userId);
  }

  /** Mark one as read (Legacy) */
  @RequirePermission('notifications:update')
  @Patch(':id/read')
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.router.markStatus(req.user.userId, id, NotificationStatus.DONE);
    return { message: 'Marked read' };
  }

  /** Update Notification Status (Inbox Zero) */
  @RequirePermission('notifications:update')
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotificationStatusDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.router.markStatus(req.user.userId, id, dto.status);
    return { message: `Status updated to ${dto.status}` };
  }

  /** Mark all as read (Legacy) */
  @RequirePermission('notifications:update')
  @Patch('read/all')
  async markAllRead(@Request() req: { user: JwtRequestUser }) {
    await this.router.archiveAll(req.user.userId);
    return { message: 'Marked all as read' };
  }

  /** Inbox Zero: Archive all unread */
  @RequirePermission('notifications:update')
  @Post('archive-all')
  async archiveAll(@Request() req: { user: JwtRequestUser }) {
    await this.router.archiveAll(req.user.userId);
    return { message: 'All notifications archived' };
  }

  /** Test endpoint to create a notification */
  @RequirePermission('notifications:create')
  @Get('test')
  async testNotification(@Request() req: { user: JwtRequestUser }) {
    await this.router.createMany(
      [req.user.userId],
      'This is a test notification',
      { projectId: 'test-project', inviteId: 'test-invite' },
      NotificationType.INFO,
    );
    return { message: 'Test notification created' };
  }

  /** Debug endpoint to show all notifications for current user */
  @RequirePermission('notifications:view')
  @Get('debug')
  async debugNotifications(@Request() req: { user: JwtRequestUser }) {
    const allNotifications = await this.inbox.listAllForUser(req.user.userId);
    const unreadNotifications = await this.inbox.listForUser(req.user.userId);

    return {
      total: allNotifications.length,
      unread: unreadNotifications.length,
      all: allNotifications.map((n) => ({
        id: n.id,
        message: n.message,
        context: n.context as Record<string, unknown>,
        read: n.read,
        type: n.type,
        createdAt: n.createdAt,
      })),
      unreadOnly: unreadNotifications.map((n) => ({
        id: n.id,
        message: n.message,
        context: n.context as Record<string, unknown>,
        type: n.type,
        createdAt: n.createdAt,
      })),
    };
  }

  /** Inbox Zero: Snooze a notification for specified hours */
  @RequirePermission('notifications:update')
  @Post(':id/snooze')
  async snooze(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('hours') hours: number,
    @Request() req: { user: JwtRequestUser },
  ) {
    const snoozeHours = hours || 1; // Default 1 hour
    const notification = await this.router.snooze(
      req.user.userId,
      id,
      snoozeHours,
    );
    if (!notification) {
      return { message: 'Notification not found' };
    }
    return {
      message: `Snoozed for ${snoozeHours} hours`,
      snoozedUntil: notification.snoozedUntil,
    };
  }

  /** Inbox Zero: Archive a single notification */
  @RequirePermission('notifications:update')
  @Post(':id/archive')
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.router.archive(req.user.userId, id);
    return { message: 'Notification archived' };
  }
}

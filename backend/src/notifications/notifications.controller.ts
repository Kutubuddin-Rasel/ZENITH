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
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import {
  NotificationType,
  NotificationStatus,
} from './entities/notification.entity';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  /** Get current user's unread notifications */
  @RequirePermission('notifications:view')
  /** Get current user's unread notifications */
  @RequirePermission('notifications:view')
  @Get()
  async list(
    @Request() req: { user: JwtRequestUser },
    @Query('status') status?: NotificationStatus,
  ) {
    return this.svc.listForUser(req.user.userId, status);
  }

  /** Get current user's all notifications (both read and unread) */
  @RequirePermission('notifications:view')
  @Get('all')
  async listAll(@Request() req: { user: JwtRequestUser }) {
    return this.svc.listAllForUser(req.user.userId);
  }

  /** Mark one as read (Legacy) */
  @RequirePermission('notifications:update')
  @Patch(':id/read')
  async markRead(
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.markStatus(req.user.userId, id, NotificationStatus.DONE);
    return { message: 'Marked read' };
  }

  /** Update Notification Status (Inbox Zero) */
  @RequirePermission('notifications:update')
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: NotificationStatus,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.markStatus(req.user.userId, id, status);
    return { message: `Status updated to ${status}` };
  }

  /** Mark all as read (Legacy) */
  @RequirePermission('notifications:update')
  @Patch('read/all')
  async markAllRead(@Request() req: { user: JwtRequestUser }) {
    await this.svc.archiveAll(req.user.userId);
    return { message: 'Marked all as read' };
  }

  /** Inbox Zero: Archive all unread */
  @RequirePermission('notifications:update')
  @Post('archive-all')
  async archiveAll(@Request() req: { user: JwtRequestUser }) {
    await this.svc.archiveAll(req.user.userId);
    return { message: 'All notifications archived' };
  }

  /** Test endpoint to create a notification */
  @RequirePermission('notifications:create')
  @Get('test')
  async testNotification(@Request() req: { user: JwtRequestUser }) {
    await this.svc.createMany(
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
    const allNotifications = await this.svc.listAllForUser(req.user.userId);
    const unreadNotifications = await this.svc.listForUser(req.user.userId);

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
}

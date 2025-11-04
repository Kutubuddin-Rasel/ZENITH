// src/notifications/notifications.controller.ts
import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { NotificationType } from './entities/notification.entity';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  /** Get current user's unread notifications */
  @RequirePermission('notifications:view')
  @Get()
  async list(@Request() req: { user: JwtRequestUser }) {
    return this.svc.listForUser(req.user.userId);
  }

  /** Get current user's all notifications (both read and unread) */
  @RequirePermission('notifications:view')
  @Get('all')
  async listAll(@Request() req: { user: JwtRequestUser }) {
    return this.svc.listAllForUser(req.user.userId);
  }

  /** Mark one as read */
  @RequirePermission('notifications:update')
  @Patch(':id/read')
  async markRead(
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.markRead(req.user.userId, id);
    return { message: 'Marked read' };
  }

  /** Mark all as read */
  @RequirePermission('notifications:update')
  @Patch('read/all')
  async markAllRead(@Request() req: { user: JwtRequestUser }) {
    await this.svc.markAllRead(req.user.userId);
    return { message: 'Marked all as read' };
  }

  /** Test endpoint to create a notification */
  @RequirePermission('notifications:create')
  @Get('test')
  async testNotification(@Request() req: { user: JwtRequestUser }) {
    console.log(
      '🧪 Test notification endpoint called for user:',
      req.user.userId,
    );
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

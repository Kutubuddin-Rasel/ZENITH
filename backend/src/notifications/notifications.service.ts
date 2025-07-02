// src/notifications/notifications.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
    private gateway: NotificationsGateway,
  ) {}

  /** Create a notification for multiple users */
  async createMany(
    userIds: string[],
    message: string,
    context: any = {},
    type: NotificationType = NotificationType.INFO,
  ): Promise<Notification[]> {
    const notifs = userIds.map((uid) =>
      this.repo.create({ userId: uid, message, context, type }),
    );
    const saved = await this.repo.save(notifs);
    for (const n of saved) {
      this.gateway.sendToUser(n.userId, {
        id: n.id,
        message: n.message,
        context: n.context,
        type: n.type,
        createdAt: n.createdAt,
      });
    }
    return saved;
  }

  /** List unread notifications for one user */
  async listForUser(userId: string): Promise<Notification[]> {
    console.log('🔍 NotificationsService: listForUser called with userId:', userId);
    const notifications = await this.repo.find({
      where: { userId, read: false },
      order: { createdAt: 'DESC' },
    });
    console.log('📊 NotificationsService: Found notifications:', notifications);
    if (!Array.isArray(notifications)) return [];
    return notifications;
  }

  /** List all notifications for one user (both read and unread) */
  async listAllForUser(userId: string): Promise<Notification[]> {
    console.log('🔍 NotificationsService: listAllForUser called with userId:', userId);
    const notifications = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    console.log('📊 NotificationsService: Found all notifications:', notifications.length);
    if (!Array.isArray(notifications)) return [];
    return notifications;
  }

  /** Mark a notification as read */
  async markRead(userId: string, notifId: string): Promise<void> {
    console.log('🔍 NotificationsService: markRead called with userId:', userId, 'notifId:', notifId);
    const notification = await this.repo.findOne({
      where: { id: notifId, userId },
    });
    console.log('📊 NotificationsService: Found notification:', notification);
    if (!notification || typeof notification !== 'object') {
      console.error('❌ NotificationsService: Notification not found or invalid');
      return;
    }
    notification.read = true;
    const saved = await this.repo.save(notification);
    console.log('✅ NotificationsService: Notification marked as read:', saved);
  }

  /** Mark all notifications as read for a user */
  async markAllRead(userId: string): Promise<void> {
    await this.repo.update({ userId, read: false }, { read: true });
  }

  /** Delete notifications by context (useful for cleaning up invitation notifications) */
  async deleteByContext(userId: string, context: any): Promise<void> {
    console.log('🔍 NotificationsService: deleteByContext called with userId:', userId, 'context:', context);
    
    // Find notifications that match the context
    const notifications = await this.repo.find({
      where: { userId },
    });
    
    console.log(`📊 NotificationsService: Found ${notifications.length} total notifications for user`);
    
    const matchingNotifications = notifications.filter(n => {
      if (!n.context) {
        console.log(`❌ Notification ${n.id} has no context`);
        return false;
      }
      
      console.log(`🔍 Checking notification ${n.id}:`, {
        notificationContext: n.context,
        searchContext: context,
        message: n.message
      });
      
      // More flexible matching - check if the context contains the search criteria
      const matches = Object.keys(context).every(key => {
        const notificationValue = n.context[key];
        const searchValue = context[key];
        const isMatch = notificationValue === searchValue;
        console.log(`  ${key}: ${notificationValue} === ${searchValue} = ${isMatch}`);
        return isMatch;
      });
      
      console.log(`✅ Notification ${n.id} matches: ${matches}`);
      return matches;
    });
    
    console.log(`📊 NotificationsService: Found ${matchingNotifications.length} notifications to delete`);
    
    if (matchingNotifications.length > 0) {
      const notificationIds = matchingNotifications.map(n => n.id);
      console.log('🗑️ Deleting notification IDs:', notificationIds);
      await this.repo.delete(notificationIds);
      console.log('✅ NotificationsService: Successfully deleted notifications:', notificationIds);
      
      // Send WebSocket deletion event
      this.gateway.sendDeletionToUser(userId, notificationIds);
    } else {
      console.log('⚠️ No matching notifications found to delete');
    }
  }

  /** Delete notifications by message content (fallback for invitation cleanup) */
  async deleteByMessageContent(userId: string, messagePattern: string): Promise<void> {
    console.log('🔍 NotificationsService: deleteByMessageContent called with userId:', userId, 'pattern:', messagePattern);
    
    const notifications = await this.repo.find({
      where: { userId, read: false },
    });
    
    const matchingNotifications = notifications.filter(n => 
      n.message.includes(messagePattern)
    );
    
    console.log(`📊 NotificationsService: Found ${matchingNotifications.length} notifications matching message pattern`);
    
    if (matchingNotifications.length > 0) {
      const notificationIds = matchingNotifications.map(n => n.id);
      console.log('🗑️ Deleting notification IDs by message content:', notificationIds);
      await this.repo.delete(notificationIds);
      console.log('✅ NotificationsService: Successfully deleted notifications by message content:', notificationIds);
      
      // Send WebSocket deletion event
      this.gateway.sendDeletionToUser(userId, notificationIds);
    } else {
      console.log('⚠️ No notifications found matching message pattern');
    }
  }
}

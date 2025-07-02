import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { NotificationType } from './entities/notification.entity';

@Injectable()
export class NotificationsListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('invite.created')
  async handleInviteCreated(payload: { invite: any; project: any; role: string }) {
    console.log('🎯 NotificationsListener: invite.created event received', payload);
    try {
      await this.notificationsService.createMany(
        [payload.invite.inviteeId],
        `You've been invited to join Project "${payload.project?.name ?? ''}" as ${payload.role}`,
        { projectId: payload.project?.id ?? '', inviteId: payload.invite.id },
        NotificationType.INFO
      );
      console.log('✅ Notification created successfully for invite');
    } catch (error) {
      console.error('❌ Error creating notification for invite:', error);
    }
  }

  @OnEvent('invite.resend')
  async handleInviteResend(payload: { invite: any; project: any }) {
    console.log('🎯 NotificationsListener: invite.resend event received', payload);
    try {
      await this.notificationsService.createMany(
        [payload.invite.inviteeId],
        `REMINDER: You've been invited to join Project "${payload.project?.name ?? ''}" as ${payload.invite.role}`,
        { projectId: payload.project?.id ?? '', inviteId: payload.invite.id },
        NotificationType.INFO
      );
      console.log('✅ Reminder notification created successfully');
    } catch (error) {
      console.error('❌ Error creating reminder notification:', error);
    }
  }

  @OnEvent('invite.responded')
  async handleInviteResponded(payload: { invite: any; project: any; invitee: any; message: string; accept: boolean; reason?: string }) {
    console.log('🎯 NotificationsListener: invite.responded event received', payload);
    try {
      await this.notificationsService.createMany(
        [payload.invite.inviterId], // Notify the inviter about the response
        payload.message,
        { projectId: payload.invite.projectId ? payload.invite.projectId : '' },
        payload.accept ? NotificationType.SUCCESS : NotificationType.WARNING
      );
      console.log('✅ Response notification created successfully');
    } catch (error) {
      console.error('❌ Error creating response notification:', error);
    }
  }

  @OnEvent('invite.revoked')
  async handleInviteRevoked(payload: { invite: any; project: any }) {
    console.log('🎯 NotificationsListener: invite.revoked event received', payload);
    try {
      // First, try to delete notifications by context
      await this.notificationsService.deleteByContext(
        payload.invite.inviteeId, 
        { projectId: payload.project?.id ?? '', inviteId: payload.invite.id }
      );
      
      // Second, try to delete by inviteId only (in case projectId doesn't match)
      await this.notificationsService.deleteByContext(
        payload.invite.inviteeId, 
        { inviteId: payload.invite.id }
      );
      
      // Third, try to delete by message content for this specific project
      const projectName = payload.project?.name ?? '';
      if (projectName) {
        await this.notificationsService.deleteByMessageContent(
          payload.invite.inviteeId,
          `invited to join Project "${projectName}"`
        );
      }
      
      // Fourth, as a final cleanup, remove ALL invitation notifications for this project
      // This prevents old notifications from persisting
      await this.notificationsService.deleteByMessageContent(
        payload.invite.inviteeId,
        `invited to join Project`
      );
      
      // Then create the revocation notification for the invitee
      await this.notificationsService.createMany(
        [payload.invite.inviteeId],
        `Your invitation to join Project "${payload.project?.name ?? ''}" has been revoked.`,
        { projectId: payload.project?.id ?? '', inviteId: payload.invite.id },
        NotificationType.WARNING
      );
      console.log('✅ Revocation notification created successfully');
    } catch (error) {
      console.error('❌ Error handling invite revocation:', error);
    }
  }
} 
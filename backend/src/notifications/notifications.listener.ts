import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from './entities/notification.entity';
import { INVITES_EVENTS } from '../invites/events/invites-events';
import {
  InviteCreatedPayload,
  InviteResendPayload,
  InviteRespondedPayload,
  InviteRevokedPayload,
} from './types/event-payloads.interface';
import { INotificationRouter } from './interfaces/notifications.interfaces';
import { NOTIFICATION_ROUTER_TOKEN } from './constants/notifications.tokens';

/**
 * NotificationsListener
 *
 * Step 3 — payloads are now DTOs (`InviteSummary` + `ProjectSummary`)
 * re-exported from the invites event module. The listener no longer
 * touches TypeORM entities, so it cannot accidentally trigger lazy
 * relations or write back to the database. The notification copy
 * still references the project name and the invitee identity, both of
 * which are available on the DTO surface.
 */
@Injectable()
export class NotificationsListener {
  constructor(
    @Inject(NOTIFICATION_ROUTER_TOKEN)
    private readonly router: INotificationRouter,
  ) {}

  @OnEvent(INVITES_EVENTS.CREATED)
  async handleInviteCreated(payload: InviteCreatedPayload) {
    try {
      // Shadow invites (email-only) have no inviteeId — skip in-app notification.
      if (!payload.invite.inviteeId) return;

      await this.router.createMany(
        [payload.invite.inviteeId],
        `You've been invited to join Project "${payload.project.name}" as ${payload.invite.role}`,
        { projectId: payload.project.id, inviteId: payload.invite.id },
        NotificationType.INFO,
      );
    } catch (error) {
      console.error('❌ Error creating notification for invite:', error);
    }
  }

  @OnEvent(INVITES_EVENTS.RESEND)
  async handleInviteResend(payload: InviteResendPayload) {
    try {
      if (!payload.invite.inviteeId) return;

      await this.router.createMany(
        [payload.invite.inviteeId],
        `REMINDER: You've been invited to join Project "${payload.project.name}" as ${payload.invite.role}`,
        { projectId: payload.project.id, inviteId: payload.invite.id },
        NotificationType.INFO,
      );
    } catch (error) {
      console.error('❌ Error creating reminder notification:', error);
    }
  }

  @OnEvent(INVITES_EVENTS.RESPONDED)
  async handleInviteResponded(payload: InviteRespondedPayload) {
    try {
      const inviteeLabel =
        payload.invitee?.name ?? payload.invitee?.email ?? 'A user';
      const projectName = payload.project.name;
      const message = payload.accept
        ? `${inviteeLabel} accepted your invite to Project "${projectName}"`
        : `${inviteeLabel} rejected your invite to Project "${projectName}"${
            payload.reason ? `: "${payload.reason}"` : ''
          }`;

      await this.router.createMany(
        [payload.invite.inviterId],
        message,
        { projectId: payload.invite.projectId },
        payload.accept ? NotificationType.SUCCESS : NotificationType.WARNING,
      );
    } catch (error) {
      console.error('❌ Error creating response notification:', error);
    }
  }

  @OnEvent(INVITES_EVENTS.REVOKED)
  async handleInviteRevoked(payload: InviteRevokedPayload) {
    try {
      if (!payload.invite.inviteeId) return;

      const inviteeId = payload.invite.inviteeId;
      const projectName = payload.project.name;

      // First, try to delete notifications by context.
      await this.router.deleteByContext(inviteeId, {
        projectId: payload.project.id,
        inviteId: payload.invite.id,
      });

      // Second, try to delete by inviteId only (in case projectId doesn't match).
      await this.router.deleteByContext(inviteeId, {
        inviteId: payload.invite.id,
      });

      // Third, try to delete by message content for this specific project.
      if (projectName) {
        await this.router.deleteByMessageContent(
          inviteeId,
          `invited to join Project "${projectName}"`,
        );
      }

      // Fourth, final cleanup: remove ALL invitation notifications for this user.
      await this.router.deleteByMessageContent(
        inviteeId,
        `invited to join Project`,
      );

      // Then create the revocation notification for the invitee.
      await this.router.createMany(
        [inviteeId],
        `Your invitation to join Project "${projectName}" has been revoked.`,
        { projectId: payload.project.id, inviteId: payload.invite.id },
        NotificationType.WARNING,
      );
    } catch (error) {
      console.error('❌ Error handling invite revocation:', error);
    }
  }
}

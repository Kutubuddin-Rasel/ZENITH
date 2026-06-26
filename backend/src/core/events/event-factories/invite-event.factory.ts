import { Injectable } from '@nestjs/common';
import type {
  IInviteEventFactory,
  InviteEventPayload,
} from '../../../common/interfaces/event-factory.interfaces';

/**
 * InviteEventFactoryProvider
 *
 * SRP: Builds membership-invite event payloads. Implements
 * `IInviteEventFactory` (bound to `INVITE_EVENT_FACTORY_TOKEN`).
 */
@Injectable()
export class InviteEventFactoryProvider implements IInviteEventFactory {
  create(data: {
    projectId: string;
    inviteId: string;
    actorId: string;
    email?: string;
    action: 'created' | 'revoked' | 'resend' | 'responded' | 'expired';
  }): InviteEventPayload {
    return {
      projectId: data.projectId,
      inviteId: data.inviteId,
      actorId: data.actorId,
      email: data.email,
      action: data.action,
      timestamp: new Date(),
    };
  }
}

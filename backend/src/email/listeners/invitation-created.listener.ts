// src/email/listeners/invitation-created.listener.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InvitationCreatedEvent } from '../../core/events/payloads/invitation-created.event';
import { EMAIL_DISPATCH_TOKEN } from '../constants/email.tokens';
import { IEmailDispatch } from '../interfaces/email.interfaces';

/**
 * Delivers the organization-invitation email.
 *
 * 🐛 THIS FLOW WAS DEAD. `InvitationService` has always emitted
 * `invitation.created`, and `sendInvitationEmail` has always existed — but
 * nothing ever subscribed, so no invitation email was sent. Invitees only ever
 * received a link if someone copied it out of the UI by hand.
 *
 * DIRECTION: `organizations` emits, `email` listens. Neither module imports the
 * other, so wiring this created no dependency edge and no cycle risk.
 *
 * FAILURE ISOLATION: a throw here would bubble into the emitter's call stack
 * (EventEmitter2 dispatches synchronously by default) and could fail the
 * invitation write that already committed. Enqueue failures are therefore
 * logged, not rethrown — the invite itself is valid regardless, and the link
 * remains retrievable from the UI. Failures AFTER enqueue are BullMQ's problem
 * and get its retry policy.
 */
@Injectable()
export class InvitationCreatedListener {
  private readonly logger = new Logger(InvitationCreatedListener.name);

  constructor(
    @Inject(EMAIL_DISPATCH_TOKEN)
    private readonly dispatch: IEmailDispatch,
  ) {}

  @OnEvent(InvitationCreatedEvent.EVENT_NAME)
  async handle(event: InvitationCreatedEvent): Promise<void> {
    try {
      await this.dispatch.sendInvitation({
        to: event.email,
        inviteLink: event.inviteLink,
        inviterName: event.inviterName,
        orgName: event.organizationName,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Failed to queue invitation email: ${msg}`);
    }
  }
}

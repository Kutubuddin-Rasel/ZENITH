// src/notifications/adapters/email-notification.adapter.ts
import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_SENDER_TOKEN } from '../../email';
import type { IEmailSender } from '../../email';
import { EmailTransportPort } from '../ports/email-transport.port';

/**
 * Email-channel adapter for `EmailTransportPort`.
 *
 * NOW A REAL IMPLEMENTATION. Previously this port was decorative: the `email`
 * module exposed only three fixed typed producers and no generic surface, so
 * this adapter logged a warning and DROPPED the message. Anything routed to the
 * email channel silently vanished.
 *
 * The `email` module now offers `IEmailSender.send` — a generic subject/body
 * producer backed by its own BullMQ job and template — so the port forwards for
 * real. That restores the intended split: notifications decides WHO and WHAT,
 * email decides HOW it physically leaves the building.
 *
 * STILL UNCONSUMED BY DESIGN: no notifications-side caller injects this port
 * yet (the gateway's `sendToUserWithAck` queue-fallback branch remains unwired).
 * Behaviour is therefore unchanged today — but the seam is now genuine, so
 * building that flow will not require re-opening this sealed module.
 *
 * The dependency is `EMAIL_SENDER_TOKEN`, not the dispatch token: this adapter
 * can send a generic message and nothing else. It has no reach into invitation,
 * token-link, or report delivery.
 */
@Injectable()
export class EmailNotificationAdapter extends EmailTransportPort {
  constructor(
    @Inject(EMAIL_SENDER_TOKEN)
    private readonly sender: IEmailSender,
  ) {
    super();
  }

  sendNotificationEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    return this.sender.send({ to, subject, body });
  }
}

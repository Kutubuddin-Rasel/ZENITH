// src/email/composers/invitation.composer.ts
import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_TEMPLATE_RENDERER_TOKEN } from '../constants/email.tokens';
import {
  IEmailComposer,
  IEmailTemplateRenderer,
  OutboundEmail,
  SendInvitationJobData,
} from '../interfaces/email.interfaces';
import { EmailLinkPolicy } from '../services/email-link-policy.service';
import { sanitizeSubject } from '../utils/subject-line.util';

/**
 * Organization-invitation email.
 *
 * ESCAPING CONTRACT (unchanged from the handler this replaces):
 *  - `inviterName` / `orgName` go through `{{double-stache}}` → auto-escaped.
 *  - `inviteLink` is domain-validated first, then emitted via
 *    `{{{triple-stache}}}` in the template's href — raw is REQUIRED there, or
 *    the query string's `&` become `&amp;` and the link breaks.
 *  - `inviteLinkDisplay` is the same URL through `{{double-stache}}` for the
 *    visible "or paste this link" text, where escaping IS wanted.
 */
@Injectable()
export class InvitationComposer implements IEmailComposer<SendInvitationJobData> {
  constructor(
    @Inject(EMAIL_TEMPLATE_RENDERER_TOKEN)
    private readonly renderer: IEmailTemplateRenderer,
    private readonly linkPolicy: EmailLinkPolicy,
  ) {}

  compose(data: SendInvitationJobData): Promise<OutboundEmail> {
    const safeLink = this.linkPolicy.assertAllowed(data.inviteLink);

    const html = this.renderer.render('invitation', {
      title: `You've been invited to ${data.orgName} on Zenith`,
      inviterName: data.inviterName,
      orgName: data.orgName,
      inviteLink: safeLink,
      inviteLinkDisplay: data.inviteLink,
    });

    return Promise.resolve({
      to: data.to,
      subject: sanitizeSubject(
        `You've been invited to join ${data.orgName} on Zenith`,
      ),
      html,
    });
  }
}

// src/email/composers/generic.composer.ts
import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_TEMPLATE_RENDERER_TOKEN } from '../constants/email.tokens';
import {
  IEmailComposer,
  IEmailTemplateRenderer,
  OutboundEmail,
  SendGenericJobData,
} from '../interfaces/email.interfaces';
import { sanitizeSubject } from '../utils/subject-line.util';

/**
 * The generic channel — a subject and a plain-text body, wrapped in the
 * standard layout so it still looks like Zenith.
 *
 * This is what fulfils the notifications module's `EmailTransportPort`. That
 * port was previously decorative: `EmailNotificationAdapter` had nothing
 * generic to call, so it logged a warning and dropped the message. Notifications
 * routes; email delivers — this composer is the delivery half.
 *
 * NO LINK VALIDATION: the body is treated as text, not markup, and is
 * auto-escaped by Handlebars. A URL pasted into it renders as visible text
 * rather than an anchor, which is the safe default for a caller-supplied body.
 * Callers needing a vetted, clickable CTA should use a typed producer on
 * `IEmailDispatch` instead of this one.
 */
@Injectable()
export class GenericComposer implements IEmailComposer<SendGenericJobData> {
  constructor(
    @Inject(EMAIL_TEMPLATE_RENDERER_TOKEN)
    private readonly renderer: IEmailTemplateRenderer,
  ) {}

  compose(data: SendGenericJobData): Promise<OutboundEmail> {
    const html = this.renderer.render('generic', {
      title: data.subject,
      heading: data.subject,
      body: data.body,
    });

    return Promise.resolve({
      to: data.to,
      subject: sanitizeSubject(data.subject),
      html,
    });
  }
}

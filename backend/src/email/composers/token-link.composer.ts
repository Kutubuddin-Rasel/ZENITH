// src/email/composers/token-link.composer.ts
import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_TEMPLATE_RENDERER_TOKEN } from '../constants/email.tokens';
import {
  IEmailComposer,
  IEmailTemplateRenderer,
  OutboundEmail,
  SendTokenLinkJobData,
  TokenLinkPurpose,
} from '../interfaces/email.interfaces';
import { EmailLinkPolicy } from '../services/email-link-policy.service';
import { sanitizeSubject } from '../utils/subject-line.util';

/** Per-purpose copy. The markup is shared; only these strings differ. */
interface TokenLinkCopy {
  subject: string;
  heading: string;
  bodyText: string;
  ctaLabel: string;
  /** Reassurance shown under the expiry line ("if you didn't ask for this…"). */
  footerNote: string;
}

/**
 * O(1) purpose → copy lookup.
 *
 * A plain object typed `Record<TokenLinkPurpose, …>` rather than a Map: the key
 * set is a closed union, so TypeScript enforces exhaustiveness at compile time —
 * adding a purpose without adding copy is a build error, not a runtime miss.
 */
const TOKEN_LINK_COPY: Readonly<Record<TokenLinkPurpose, TokenLinkCopy>> = {
  'password-reset': {
    subject: 'Reset Your Password — Zenith',
    heading: 'Reset Your Password',
    bodyText:
      'We received a request to reset the password for your Zenith account. Click the button below to set a new password:',
    ctaLabel: 'Reset Password',
    footerNote:
      "If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.",
  },
  '2fa-recovery': {
    subject: 'Two-Factor Recovery — Zenith',
    heading: 'Recover Access to Your Account',
    bodyText:
      'We received a request to disable two-factor authentication on your Zenith account. Click the button below to confirm and regain access:',
    ctaLabel: 'Recover Access',
    footerNote:
      "If you didn't request this, ignore this email — two-factor authentication stays enabled. Consider changing your password if you did not initiate it.",
  },
  'email-verification': {
    subject: 'Verify Your Email — Zenith',
    heading: 'Verify Your Email Address',
    bodyText:
      'Welcome to Zenith! Confirm your email address to activate your account:',
    ctaLabel: 'Verify Email',
    footerNote:
      "If you didn't create a Zenith account, you can safely ignore this email.",
  },
};

/**
 * Every tokenised-link email — 2FA recovery, signup verification, and password
 * reset.
 *
 * WHY ONE COMPOSER FOR THREE FLOWS: they are the same email. Recipient, a
 * single-use URL, an expiry, a reassurance line. Three near-identical templates
 * would drift in styling and in the security copy that actually matters. The
 * shape lives in `token-link.hbs`; the words live in the table above.
 *
 * Two of the three now have live call sites (the auth module emits domain
 * events). `password-reset` is wired but uncalled — this codebase has no
 * forgot-password endpoint, so it waits rather than being invented.
 */
@Injectable()
export class TokenLinkComposer implements IEmailComposer<SendTokenLinkJobData> {
  constructor(
    @Inject(EMAIL_TEMPLATE_RENDERER_TOKEN)
    private readonly renderer: IEmailTemplateRenderer,
    private readonly linkPolicy: EmailLinkPolicy,
  ) {}

  compose(data: SendTokenLinkJobData): Promise<OutboundEmail> {
    const copy = TOKEN_LINK_COPY[data.purpose];
    const safeLink = this.linkPolicy.assertAllowed(data.link);

    const html = this.renderer.render('token-link', {
      title: copy.subject,
      heading: copy.heading,
      bodyText: copy.bodyText,
      ctaLabel: copy.ctaLabel,
      footerNote: copy.footerNote,
      userName: data.userName,
      link: safeLink, // triple-stache in the template — must stay raw
      linkDisplay: data.link, // double-stache — escaped for display
      expiresIn: data.expiresIn,
    });

    return Promise.resolve({
      to: data.to,
      subject: sanitizeSubject(copy.subject),
      html,
    });
  }
}

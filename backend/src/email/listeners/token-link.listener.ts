// src/email/listeners/token-link.listener.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailVerificationRequestedEvent } from '../../core/events/payloads/email-verification-requested.event';
import { TwoFactorRecoveryRequestedEvent } from '../../core/events/payloads/two-factor-recovery-requested.event';
import { EMAIL_DISPATCH_TOKEN } from '../constants/email.tokens';
import { IEmailDispatch, TokenLinkPurpose } from '../interfaces/email.interfaces';

/**
 * Delivers every tokenised-link email.
 *
 * 🐛 BOTH FLOWS WERE DEAD, each marked by a `// TODO: dispatch … via
 * EmailService` in the auth module:
 *   - signup verification never reached the new user
 *   - 2FA recovery returned a success message while only logging the link to
 *     the dev console, making the endpoint uncompletable in production
 *
 * DIRECTION: `auth` emits, `email` listens. No module edge either way.
 *
 * FAILURE ISOLATION: enqueue failures are logged, not rethrown — EventEmitter2
 * dispatches synchronously, so a throw would surface inside the auth request
 * that already succeeded (the user IS registered; the token IS issued).
 * Rethrowing would turn "verification email delayed" into "registration
 * appears to have failed", which is strictly worse for the caller.
 */
@Injectable()
export class TokenLinkListener {
  private readonly logger = new Logger(TokenLinkListener.name);

  constructor(
    @Inject(EMAIL_DISPATCH_TOKEN)
    private readonly dispatch: IEmailDispatch,
  ) {}

  @OnEvent(EmailVerificationRequestedEvent.EVENT_NAME)
  async handleEmailVerification(
    event: EmailVerificationRequestedEvent,
  ): Promise<void> {
    await this.dispatchTokenLink('email-verification', {
      to: event.email,
      link: event.verificationLink,
      expiresIn: event.expiresIn,
      userName: event.userName,
    });
  }

  @OnEvent(TwoFactorRecoveryRequestedEvent.EVENT_NAME)
  async handleTwoFactorRecovery(
    event: TwoFactorRecoveryRequestedEvent,
  ): Promise<void> {
    await this.dispatchTokenLink('2fa-recovery', {
      to: event.email,
      link: event.recoveryLink,
      expiresIn: event.expiresIn,
    });
  }

  private async dispatchTokenLink(
    purpose: TokenLinkPurpose,
    spec: { to: string; link: string; expiresIn: string; userName?: string },
  ): Promise<void> {
    try {
      await this.dispatch.sendTokenLink({ ...spec, purpose });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      // The address is deliberately omitted — these events concern accounts in
      // a pre-verified or recovery state, and the link carries a live token.
      this.logger.warn(`Failed to queue ${purpose} email: ${msg}`);
    }
  }
}

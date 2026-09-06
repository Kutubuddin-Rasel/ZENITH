/**
 * TwoFactorRecoveryRequestedEvent — Domain Event Payload.
 *
 * Emitted by `TwoFactorAuthController` when a user requests 2FA recovery and a
 * recovery token was actually issued. The `email` module's `TokenLinkListener`
 * subscribes and enqueues the delivery.
 *
 * Replaces the `// TODO: dispatch the recovery link via EmailService`, which
 * left the endpoint returning a success message while only ever logging the
 * link to the dev console — i.e. the recovery flow was uncompletable in
 * production.
 *
 * SECURITY: the endpoint deliberately returns the same response whether or not
 * the account exists (user enumeration defence), so this event is emitted ONLY
 * on the branch where a real token was minted. It is throttled upstream
 * (3 requests / 5 min) and rate-limited again per-recipient in the producer.
 *
 * EVENT NAME: 'auth.2fa-recovery-requested'
 */

export class TwoFactorRecoveryRequestedEvent {
  static readonly EVENT_NAME = 'auth.2fa-recovery-requested' as const;

  constructor(
    /** Recipient email address. */
    public readonly email: string,
    /** Fully-built recovery URL (the emitter owns link construction). */
    public readonly recoveryLink: string,
    /** Human-readable expiry for the email copy, e.g. "15 minutes". */
    public readonly expiresIn: string,
  ) {}
}

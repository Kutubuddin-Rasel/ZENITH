/**
 * EmailVerificationRequestedEvent — Domain Event Payload.
 *
 * Emitted by `RegistrationService` once a new user row is committed and an
 * email-verification token has been issued. The `email` module's
 * `TokenLinkListener` subscribes and enqueues the delivery, which keeps
 * registration decoupled from email infrastructure — `auth` only ever emits,
 * `email` only ever listens, so no module edge is created in either direction.
 *
 * Replaces the `// TODO: dispatch verification email via EmailService` that
 * left signup verification silently undelivered.
 *
 * TIMING: emitted AFTER the user write succeeds, so a failed registration
 * cannot produce a phantom verification email.
 *
 * EVENT NAME: 'user.email-verification-requested'
 */

export class EmailVerificationRequestedEvent {
  static readonly EVENT_NAME = 'user.email-verification-requested' as const;

  constructor(
    /** Email address to verify — also the recipient. */
    public readonly email: string,
    /** Fully-built verification URL (the emitter owns link construction). */
    public readonly verificationLink: string,
    /** Human-readable expiry for the email copy, e.g. "24 hours". */
    public readonly expiresIn: string,
    /** Recipient display name, when known. */
    public readonly userName?: string,
  ) {}
}

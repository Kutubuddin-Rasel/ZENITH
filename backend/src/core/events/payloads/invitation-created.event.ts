/**
 * InvitationCreatedEvent — Domain Event Payload.
 *
 * Emitted by InvitationService when a new invitation is created.
 * Listeners (e.g., EmailModule) subscribe to this event to send
 * the invitation email, fully decoupling the invitation workflow
 * from the email infrastructure.
 *
 * EVENT NAME: 'invitation.created'
 */

export class InvitationCreatedEvent {
  static readonly EVENT_NAME = 'invitation.created' as const;

  constructor(
    /** Email address of the invitee */
    public readonly email: string,
    /** Full invite link (e.g., https://app.zenith.dev/invite/abc123) */
    public readonly inviteLink: string,
    /** Name or email of the person who sent the invite */
    public readonly inviterName: string,
    /** Organization name for the email template */
    public readonly organizationName: string,
  ) {}
}

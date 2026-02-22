// ============================================================================
// EMAIL JOB TYPE DEFINITIONS
// Strict typed payloads for BullMQ email jobs — zero `any` tolerance
// ============================================================================

/**
 * Job name constants for type-safe job dispatch.
 * Used by both the Producer (EmailService) and Consumer (EmailProcessor).
 *
 * EXTENSIBILITY: To add a new email type, add a constant here,
 * create a corresponding JobData interface, and add a handler in EmailProcessor.
 */
export const EMAIL_JOB_NAMES = {
  SEND_INVITATION: 'send-invitation',
  SEND_PASSWORD_RESET: 'send-password-reset',
} as const;

export type EmailJobName =
  (typeof EMAIL_JOB_NAMES)[keyof typeof EMAIL_JOB_NAMES];

/** Queue name constant — matches CoreQueueModule registration */
export const EMAIL_QUEUE_NAME = 'email';

// ============================================================================
// JOB DATA INTERFACES
// ============================================================================

/**
 * Payload for invitation email jobs.
 *
 * IMPORTANT: All fields are raw/unsanitized at this point.
 * Sanitization is handled by Handlebars auto-escaping in the processor.
 * Rate limiting + validation happens in the producer (EmailService).
 */
export interface SendInvitationJobData {
  /** Recipient email address (validated in producer) */
  to: string;
  /** Invitation acceptance URL (domain-validated in processor) */
  inviteLink: string;
  /** Name of the person sending the invite (auto-escaped by Handlebars) */
  inviterName: string;
  /** Organization name (auto-escaped by Handlebars) */
  orgName: string;
}

/**
 * Payload for password reset email jobs.
 */
export interface SendPasswordResetJobData {
  /** Recipient email address (validated in producer) */
  to: string;
  /** Password reset URL (domain-validated in processor) */
  resetLink: string;
  /** User's display name (optional, auto-escaped by Handlebars) */
  userName?: string;
  /** Human-readable expiry time, e.g. "1 hour" (auto-escaped by Handlebars) */
  expiresIn: string;
}

/**
 * Union type for all email job data.
 * Expand this union as new email types are added.
 */
export type EmailJobData = SendInvitationJobData | SendPasswordResetJobData;

/**
 * Result returned by the email processor after successful send.
 */
export interface EmailJobResult {
  /** Resend API message ID */
  messageId: string;
  /** Recipient email address */
  recipient: string;
  /** Timestamp of successful send */
  sentAt: string;
}

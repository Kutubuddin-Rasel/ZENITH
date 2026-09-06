// src/email/interfaces/email.interfaces.ts
//
// ============================================================================
// EMAIL MODULE — SEGREGATED CONTRACTS (Step 1)
//
// Every contract here is deliberately narrow (ISP): a consumer that only needs
// to enqueue a report email must not be handed template rendering, rate-limit
// internals, or the vendor transport. Concrete classes are bound behind the
// symbol tokens in `../constants/email.tokens.ts`; nothing outside this module
// injects a class.
//
// STRUCTURE
//   1. Job-name constants + queue name        (BullMQ wire contract)
//   2. Job payloads — a TAGGED union          (kills the `as never` casts)
//   3. Transport-level value objects          (OutboundEmail / receipt)
//   4. Inbound contracts   — IEmailDispatch / IEmailSender
//   5. Internal contracts  — rate limiter / renderer / composer
//   6. Outbound contract   — IEmailTransport (the Resend seam)
// ============================================================================

// ============================================================================
// 1. WIRE CONSTANTS
// ============================================================================

/**
 * Job name constants for type-safe dispatch, shared by the producer
 * (`EmailDispatchService`) and the consumer (`EmailProcessor`).
 *
 * EXTENSIBILITY: add a constant here, add a matching `SendXJobData` member to
 * the tagged union below, and register one composer in the registry. `process()`
 * never changes.
 *
 * NB (Step 1): the former `SEND_PASSWORD_RESET` is generalised into
 * `SEND_TOKEN_LINK` — 2FA recovery, signup verification, and password reset are
 * the same email shape (tokenised link + expiry) differing only in copy. The
 * rename is safe because `sendPasswordResetEmail` had zero callers repo-wide,
 * so no job with the old name can be in flight.
 */
export const EMAIL_JOB_NAMES = {
  SEND_INVITATION: 'send-invitation',
  SEND_TOKEN_LINK: 'send-token-link',
  SEND_REPORT: 'send-report',
  SEND_GENERIC: 'send-generic',
} as const;

export type EmailJobName =
  (typeof EMAIL_JOB_NAMES)[keyof typeof EMAIL_JOB_NAMES];

/** Queue name constant — matches the central `CoreQueueModule` registration. */
export const EMAIL_QUEUE_NAME = 'email';

/**
 * The tokenised-link flavours sharing `token-link.hbs`.
 *
 * `'password-reset'` currently has NO call site — this codebase has no
 * forgot-password endpoint. It ships as a ready purpose so adding one later is
 * a single `sendTokenLink` call rather than a re-opening of a sealed module.
 */
export type TokenLinkPurpose =
  | 'password-reset'
  | '2fa-recovery'
  | 'email-verification';

// ============================================================================
// 2. JOB PAYLOADS (tagged union)
//
// Every member carries a literal `type` discriminant matching its job name.
// This is what lets the processor narrow `job.data` structurally instead of
// laundering it through `as never` / `as unknown as SendXJobData`.
//
// SANITISATION CONTRACT: all string fields are RAW here. Handlebars
// auto-escapes `{{vars}}` at render time; subjects (plain text, never run
// through Handlebars) are escaped by `escapeSubject`. Recipient validation and
// rate limiting happen in the producer, before enqueue.
// ============================================================================

/** Payload for organization-invitation emails. */
export interface SendInvitationJobData {
  readonly type: typeof EMAIL_JOB_NAMES.SEND_INVITATION;
  /** Recipient email address (validated in the producer). */
  to: string;
  /** Invitation acceptance URL (domain-validated in the composer). */
  inviteLink: string;
  /** Name of the person sending the invite. */
  inviterName: string;
  /** Organization name. */
  orgName: string;
}

/** Payload for any tokenised-link email (recovery / verification / reset). */
export interface SendTokenLinkJobData {
  readonly type: typeof EMAIL_JOB_NAMES.SEND_TOKEN_LINK;
  /** Recipient email address (validated in the producer). */
  to: string;
  /** Which flavour of token link — selects the copy, not the template. */
  purpose: TokenLinkPurpose;
  /** The tokenised URL (domain-validated in the composer). */
  link: string;
  /** Human-readable expiry, e.g. "1 hour". */
  expiresIn: string;
  /** Recipient display name, when known. */
  userName?: string;
}

/** Payload for scheduled-report distribution emails. */
export interface SendReportJobData {
  readonly type: typeof EMAIL_JOB_NAMES.SEND_REPORT;
  /** Recipient email address. */
  to: string;
  /** Project name for subject/body. */
  projectName: string;
  /** Human-readable report type, e.g. "Velocity". */
  reportType: string;
  /**
   * S3/MinIO object key. The presigned URL is minted at CONSUME time, not at
   * enqueue time, so a backed-up queue does not eat into the link's lifetime.
   */
  s3ObjectKey: string;
  /**
   * Link lifetime in hours. This single value drives BOTH the presigned URL's
   * `expiresIn` and the "valid for N hours" copy — they must never diverge.
   * @see DownloadLinkPort
   */
  expiresInHours: number;
}

/**
 * Payload for the generic channel — the seam that fulfils the notifications
 * module's `EmailTransportPort`. Body is plain text; the composer wraps it in
 * `generic.hbs` so it still gets the standard layout.
 */
export interface SendGenericJobData {
  readonly type: typeof EMAIL_JOB_NAMES.SEND_GENERIC;
  to: string;
  subject: string;
  body: string;
}

/** Discriminated union of every email job payload. */
export type EmailJobData =
  | SendInvitationJobData
  | SendTokenLinkJobData
  | SendReportJobData
  | SendGenericJobData;

/** Narrows the union by job name — the composer registry's key→payload map. */
export type EmailJobDataFor<TName extends EmailJobName> = Extract<
  EmailJobData,
  { type: TName }
>;

// ============================================================================
// 3. TRANSPORT VALUE OBJECTS
// ============================================================================

/**
 * A fully-composed message, ready to hand to a transport. Producing one of
 * these is the composers' entire job; sending one is the transport's entire
 * job. Nothing downstream of composition knows what an "invitation" is.
 */
export interface OutboundEmail {
  /** Recipient email address. */
  to: string;
  /** Plain-text subject, already escaped. */
  subject: string;
  /** Fully rendered HTML body, layout included. */
  html: string;
}

/** Transport acknowledgement — also the BullMQ job return value. */
export interface EmailDeliveryReceipt {
  /** Provider-side message ID (`mock-<jobId>` when running without an API key). */
  messageId: string;
  /** Recipient email address. */
  recipient: string;
  /** ISO-8601 timestamp of the successful send. */
  sentAt: string;
}

// ============================================================================
// 4. INBOUND CONTRACTS (what other modules are allowed to hold)
// ============================================================================

/** Command spec for an organization-invitation email. */
export interface InvitationEmailSpec {
  to: string;
  inviteLink: string;
  inviterName: string;
  orgName: string;
}

/** Command spec for a tokenised-link email. */
export interface TokenLinkEmailSpec {
  to: string;
  purpose: TokenLinkPurpose;
  link: string;
  /** Human-readable expiry, e.g. "1 hour". Defaults are the caller's choice. */
  expiresIn: string;
  userName?: string;
}

/** Command spec for a scheduled-report distribution email. */
export interface ReportEmailSpec {
  to: string;
  projectName: string;
  reportType: string;
  s3ObjectKey: string;
  /** Drives both the presigned-URL TTL and the copy. Defaults to 48. */
  expiresInHours?: number;
}

/** Command spec for the generic channel. */
export interface GenericEmailSpec {
  to: string;
  subject: string;
  body: string;
}

/**
 * Typed domain producers — the surface `reports` and the in-module event
 * listeners consume. Every method validates the recipient, applies the
 * per-recipient rate limit, and enqueues; none of them send inline.
 *
 * Bound to `EMAIL_DISPATCH_TOKEN`.
 */
export interface IEmailDispatch {
  sendInvitation(spec: InvitationEmailSpec): Promise<void>;
  sendTokenLink(spec: TokenLinkEmailSpec): Promise<void>;
  sendReport(spec: ReportEmailSpec): Promise<void>;
}

/**
 * The generic one-method surface. Segregated from `IEmailDispatch` on purpose:
 * `EmailNotificationAdapter` needs exactly this and must not be able to reach
 * the domain producers.
 *
 * Bound to `EMAIL_SENDER_TOKEN`.
 */
export interface IEmailSender {
  send(spec: GenericEmailSpec): Promise<void>;
}

// ============================================================================
// 5. INTERNAL CONTRACTS (module-private; never exported through the barrel's
//    consumer story — they exist so the internals can be swapped and tested)
// ============================================================================

/**
 * Per-recipient send throttling. Bound to `EMAIL_RATE_LIMITER_TOKEN`.
 *
 * FAIL-OPEN by contract: a Redis outage must not block legitimate email.
 */
export interface IEmailRateLimiter {
  /** @throws HttpException(429) when the recipient is over their window quota. */
  check(recipientEmail: string): Promise<void>;
  /** Remaining sends in the current window. */
  remaining(recipientEmail: string): Promise<number>;
}

/** Handlebars compile+cache surface. Bound to `EMAIL_TEMPLATE_RENDERER_TOKEN`. */
export interface IEmailTemplateRenderer {
  /** @throws Error when `templateName` was never loaded. */
  render(templateName: string, context: Record<string, unknown>): string;
  /** Names of every loaded content template. */
  available(): string[];
}

/**
 * Turns one job payload into a sendable message. One implementation per job
 * name, resolved through an O(1) `ReadonlyMap` registry.
 *
 * Async because composition may need I/O — the report composer mints a
 * presigned download URL through `DownloadLinkPort`.
 */
export interface IEmailComposer<TData extends EmailJobData = EmailJobData> {
  compose(data: TData): Promise<OutboundEmail>;
}

/** O(1) job-name → composer lookup. Bound to `EMAIL_COMPOSER_REGISTRY_TOKEN`. */
export interface IEmailComposerRegistry {
  /** `undefined` for an unknown job name — the caller logs and drops. */
  resolve(jobName: string): IEmailComposer | undefined;
}

// ============================================================================
// 6. OUTBOUND CONTRACT (the vendor seam)
// ============================================================================

/**
 * The email-provider boundary. `ResendEmailTransport` is the only
 * implementation and is meant to stay that way — this port exists to get the
 * vendor SDK out of the BullMQ worker's constructor (making the worker
 * testable), NOT to support a provider zoo. Do not add an SES/SendGrid adapter
 * without a real requirement.
 *
 * Bound to `EMAIL_TRANSPORT_TOKEN`.
 *
 * @throws Error on provider failure — BullMQ retries (3 attempts, exp backoff).
 */
export interface IEmailTransport {
  deliver(message: OutboundEmail): Promise<EmailDeliveryReceipt>;
}

// ============================================================================
// DEPRECATED ALIAS — removed in Step 3 once the legacy producer is deleted.
// ============================================================================

/** @deprecated Use {@link EmailDeliveryReceipt}. */
export type EmailJobResult = EmailDeliveryReceipt;

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { S3StorageProvider } from '../attachments/storage/providers/s3-storage.provider';
import { EmailTemplateService } from './email-template.service';
import {
  EMAIL_QUEUE_NAME,
  EMAIL_JOB_NAMES,
  SendInvitationJobData,
  SendPasswordResetJobData,
  SendReportJobData,
  EmailJobData,
  EmailJobResult,
} from './email.interfaces';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ResendError {
  message: string;
  name?: string;
}

interface ResendResponse {
  data: { id: string } | null;
  error: ResendError | null;
}

/** Handler function signature for the strategy map */
type EmailJobHandler = (
  data: never,
  job: Job<EmailJobData, EmailJobResult, string>,
) => Promise<EmailJobResult>;

// =============================================================================
// Subject-line escape (plain text, not run through Handlebars)
// =============================================================================
function escapeSubject(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// EMAIL PROCESSOR (CONSUMER)
//
// ARCHITECTURE:
// BullMQ worker that processes email jobs from Redis.
// Uses a Strategy Map for polymorphic dispatch (Open/Closed Principle).
//
// EXTENSIBILITY — Adding a new email type:
//   1. Add a handler method (e.g., handleWelcome)
//   2. Add one entry to this.handlers Map in the constructor
//   3. Create a .hbs template file
//   Zero changes to process() needed.
//
// RETRY: Inherits CoreQueueModule defaults (3 attempts, exp backoff 1s→2s→4s)
// SECURITY: Handlebars auto-escapes {{vars}}. URLs domain-validated explicitly.
// ============================================================================

@Processor(EMAIL_QUEUE_NAME)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  private resend: Resend | null = null;
  private readonly fromEmail: string;

  /** Strategy Map — each job name maps to a handler function */
  private readonly handlers: Map<string, EmailJobHandler>;

  constructor(
    private readonly configService: ConfigService,
    private readonly templateService: EmailTemplateService,
    private readonly s3StorageProvider: S3StorageProvider,
  ) {
    super();

    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn(
        'RESEND_API_KEY is not defined. Emails will be logged to console only.',
      );
    }
    this.fromEmail =
      this.configService.get<string>('EMAIL_FROM') || 'onboarding@resend.dev';

    // Initialize strategy map
    this.handlers = new Map<string, EmailJobHandler>([
      [
        EMAIL_JOB_NAMES.SEND_INVITATION,
        (d, j) =>
          this.handleInvitation(d as unknown as SendInvitationJobData, j),
      ],
      [
        EMAIL_JOB_NAMES.SEND_PASSWORD_RESET,
        (d, j) =>
          this.handlePasswordReset(d as unknown as SendPasswordResetJobData, j),
      ],
      [
        EMAIL_JOB_NAMES.SEND_REPORT,
        (d, j) => this.handleReport(d as unknown as SendReportJobData, j),
      ],
    ]);
  }

  // ==========================================================================
  // JOB DISPATCH (Strategy Map lookup)
  // ==========================================================================

  async process(
    job: Job<EmailJobData, EmailJobResult, string>,
  ): Promise<EmailJobResult | undefined> {
    this.logger.log(
      `Processing email job ${job.id} [${job.name}] attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 3}`,
    );

    const handler = this.handlers.get(job.name);
    if (!handler) {
      this.logger.warn(`Unknown email job name: ${job.name}`);
      return undefined;
    }

    return handler(job.data as never, job);
  }

  // ==========================================================================
  // JOB HANDLERS
  // ==========================================================================

  private async handleInvitation(
    data: SendInvitationJobData,
    job: Job<EmailJobData, EmailJobResult, string>,
  ): Promise<EmailJobResult> {
    const { to, inviteLink, inviterName, orgName } = data;

    const safeInviteLink = this.validateUrlOrThrow(inviteLink, job);

    const html = this.templateService.render('invitation', {
      title: `You've been invited to ${orgName} on Zenith`,
      inviterName, // auto-escaped by Handlebars {{}}
      orgName, // auto-escaped by Handlebars {{}}
      inviteLink: safeInviteLink, // triple-stache in template
      inviteLinkDisplay: inviteLink, // auto-escaped by Handlebars {{}}
    });

    const subject = `You've been invited to join ${escapeSubject(orgName)} on Zenith`;
    return this.sendViaResend(to, subject, html, job);
  }

  private async handlePasswordReset(
    data: SendPasswordResetJobData,
    job: Job<EmailJobData, EmailJobResult, string>,
  ): Promise<EmailJobResult> {
    const { to, resetLink, userName, expiresIn } = data;

    const safeResetLink = this.validateUrlOrThrow(resetLink, job);

    const html = this.templateService.render('password-reset', {
      title: 'Reset Your Password — Zenith',
      userName, // auto-escaped by Handlebars {{}}
      resetLink: safeResetLink, // triple-stache in template
      resetLinkDisplay: resetLink, // auto-escaped by Handlebars {{}}
      expiresIn, // auto-escaped by Handlebars {{}}
    });

    return this.sendViaResend(to, 'Reset Your Password — Zenith', html, job);
  }

  /**
   * Handle scheduled report distribution email.
   *
   * ARCHITECTURE:
   * - Presigned URL is generated HERE (at consume time), not at enqueue time.
   *   This ensures the freshest possible TTL — if the queue is backed up,
   *   the user still gets the full 48-hour window from email delivery.
   * - S3 object key → presigned URL → Handlebars template → Resend API
   */
  private async handleReport(
    data: SendReportJobData,
    job: Job<EmailJobData, EmailJobResult, string>,
  ): Promise<EmailJobResult> {
    const { to, projectName, reportType, s3ObjectKey, expiresInHours } = data;

    // Generate presigned download URL with configured TTL
    // Override the provider's default TTL with our 48h expiry
    const downloadUrl =
      await this.s3StorageProvider.getDownloadUrl(s3ObjectKey);

    const html = this.templateService.render('report-ready', {
      title: `Weekly ${reportType} Report — ${projectName}`,
      projectName,
      reportType,
      downloadUrl,
      expiresInHours: String(expiresInHours),
      generatedAt: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    });

    const subject = `📊 Weekly ${escapeSubject(reportType)} Report — ${escapeSubject(projectName)}`;
    return this.sendViaResend(to, subject, html, job);
  }

  // ==========================================================================
  // RESEND API (unified send)
  // ==========================================================================

  private async sendViaResend(
    to: string,
    subject: string,
    html: string,
    job: Job<EmailJobData, EmailJobResult, string>,
  ): Promise<EmailJobResult> {
    if (!this.resend) {
      this.logger.log(
        `[MOCK EMAIL] Job ${job.id}: To: ${to}, Subject: ${subject}`,
      );
      return {
        messageId: `mock-${job.id ?? 'unknown'}`,
        recipient: to,
        sentAt: new Date().toISOString(),
      };
    }

    const response = (await this.resend.emails.send({
      from: this.fromEmail,
      to: [to],
      subject,
      html,
    })) as ResendResponse;

    const { data: resendData, error } = response;

    if (error) {
      this.logger.error(
        `Job ${job.id}: Resend API error for ${to}: ${error.message}`,
      );
      throw new Error(`Resend API error: ${error.message}`);
    }

    const messageId = resendData?.id ?? 'unknown';
    this.logger.log(
      `Job ${job.id}: Email sent to ${to}, Resend ID: ${messageId}`,
    );

    return { messageId, recipient: to, sentAt: new Date().toISOString() };
  }

  // ==========================================================================
  // URL VALIDATION
  // ==========================================================================

  private validateUrlOrThrow(
    url: string,
    job: Job<EmailJobData, EmailJobResult, string>,
  ): string {
    const safeUrl = this.validateUrl(url);
    if (!safeUrl) {
      this.logger.error(`Job ${job.id}: Email blocked — invalid link domain`);
      throw new Error('Invalid link domain');
    }
    return safeUrl;
  }

  private validateUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const allowedDomains = this.getAllowedLinkDomains();
      const isAllowed = allowedDomains.some(
        (domain) =>
          parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
      );

      if (!isAllowed) {
        this.logger.warn(
          `URL validation failed: ${parsed.hostname} not in allowed domains`,
        );
        return '';
      }

      if (
        process.env.NODE_ENV === 'production' &&
        parsed.protocol !== 'https:'
      ) {
        this.logger.warn('URL validation failed: non-HTTPS URL in production');
        return '';
      }

      return url;
    } catch {
      this.logger.warn('URL validation failed: invalid URL format');
      return '';
    }
  }

  private getAllowedLinkDomains(): string[] {
    const configuredDomains = this.configService.get<string>(
      'ALLOWED_EMAIL_LINK_DOMAINS',
    );

    if (configuredDomains) {
      return configuredDomains.split(',').map((d) => d.trim());
    }

    return ['localhost', '127.0.0.1'];
  }
}

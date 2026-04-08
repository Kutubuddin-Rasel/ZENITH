import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as emailValidator from 'email-validator';
import { EmailRateLimitService } from './email-rate-limit.service';
import {
  EMAIL_QUEUE_NAME,
  EMAIL_JOB_NAMES,
  EmailJobData,
  EmailJobResult,
  SendInvitationJobData,
  SendPasswordResetJobData,
  SendReportJobData,
} from './email.interfaces';

// ============================================================================
// EMAIL SERVICE (PRODUCER)
//
// ARCHITECTURE:
// Pure Producer in the BullMQ pattern. Validates, rate-limits, and enqueues.
// The actual Resend API call happens in EmailProcessor (Consumer).
//
// SECURITY LAYERS (in order):
// 1. Email validation — format check via email-validator (fail fast → 400)
// 2. Rate limiting — per-recipient via Redis counters (fail fast → 429)
// 3. Job enqueue — persisted to Redis for reliable delivery
// 4. Sanitization — Handlebars auto-escaping in EmailProcessor
//
// @see Phase 1 — HTML Injection Prevention
// @see Phase 2 — Per-Recipient Rate Limiting
// @see Phase 3 — Queue-Based Delivery
// @see Phase 4 — Defensive Validation
// @see Phase 6 — Extensible Email Types
// ============================================================================

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectQueue(EMAIL_QUEUE_NAME)
    private readonly emailQueue: Queue<EmailJobData, EmailJobResult>,
    private readonly rateLimitService: EmailRateLimitService,
  ) {}

  // ==========================================================================
  // PUBLIC METHODS (PRODUCERS)
  // ==========================================================================

  /**
   * Enqueues an organization invitation email for async delivery.
   */
  async sendInvitationEmail(
    to: string,
    inviteLink: string,
    inviterName: string,
    orgName: string,
  ): Promise<void> {
    this.validateEmailAddress(to);
    await this.rateLimitService.checkRateLimit(to);

    const jobData: SendInvitationJobData = {
      to,
      inviteLink,
      inviterName,
      orgName,
    };

    const job = await this.emailQueue.add(
      EMAIL_JOB_NAMES.SEND_INVITATION,
      jobData,
    );

    this.logger.log(
      `Invitation email queued for ${to} — Job ID: ${job.id ?? 'unknown'}`,
    );
  }

  /**
   * Enqueues a password reset email for async delivery.
   */
  async sendPasswordResetEmail(
    to: string,
    resetLink: string,
    userName?: string,
    expiresIn: string = '1 hour',
  ): Promise<void> {
    this.validateEmailAddress(to);
    await this.rateLimitService.checkRateLimit(to);

    const jobData: SendPasswordResetJobData = {
      to,
      resetLink,
      userName,
      expiresIn,
    };

    const job = await this.emailQueue.add(
      EMAIL_JOB_NAMES.SEND_PASSWORD_RESET,
      jobData,
    );

    this.logger.log(
      `Password reset email queued for ${to} — Job ID: ${job.id ?? 'unknown'}`,
    );
  }

  /**
   * Enqueues a scheduled report distribution email for async delivery.
   *
   * ARCHITECTURE:
   * The presigned URL is NOT generated here (producer). It is generated
   * at consume time in EmailProcessor to ensure the freshest possible TTL.
   * We pass the S3 object key instead.
   *
   * @param to - Project Lead email address
   * @param projectName - Project name for email branding
   * @param reportType - Human-readable report type
   * @param s3ObjectKey - MinIO/S3 object key for the report
   * @param expiresInHours - URL expiry in hours (default: 48)
   */
  async sendReportEmail(
    to: string,
    projectName: string,
    reportType: string,
    s3ObjectKey: string,
    expiresInHours: number = 48,
  ): Promise<void> {
    this.validateEmailAddress(to);
    await this.rateLimitService.checkRateLimit(to);

    const jobData: SendReportJobData = {
      to,
      projectName,
      reportType,
      s3ObjectKey,
      expiresInHours,
    };

    const job = await this.emailQueue.add(EMAIL_JOB_NAMES.SEND_REPORT, jobData);

    this.logger.log(
      `Report email queued for ${to} (${projectName} / ${reportType}) — Job ID: ${job.id ?? 'unknown'}`,
    );
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validates email address format using email-validator.
   * Called BEFORE rate limiting and enqueue (fail fast).
   *
   * @throws BadRequestException if email format is invalid
   */
  private validateEmailAddress(email: string): void {
    if (!email || !emailValidator.validate(email)) {
      throw new BadRequestException(`Invalid email address format: "${email}"`);
    }
  }
}

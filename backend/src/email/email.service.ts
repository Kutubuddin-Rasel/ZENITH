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
   *
   * @param to - Recipient email address
   * @param inviteLink - The invitation acceptance URL
   * @param inviterName - Name of the person sending the invite
   * @param orgName - Organization name
   */
  async sendInvitationEmail(
    to: string,
    inviteLink: string,
    inviterName: string,
    orgName: string,
  ): Promise<void> {
    // LAYER 1: Validate email format (fail fast → 400)
    this.validateEmailAddress(to);

    // LAYER 2: Per-recipient rate limiting (fail fast → 429)
    await this.rateLimitService.checkRateLimit(to);

    // LAYER 3: Enqueue for async processing
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
   *
   * @param to - Recipient email address
   * @param resetLink - Password reset URL
   * @param userName - User's display name (optional)
   * @param expiresIn - Human-readable expiry, e.g. "1 hour"
   */
  async sendPasswordResetEmail(
    to: string,
    resetLink: string,
    userName?: string,
    expiresIn: string = '1 hour',
  ): Promise<void> {
    // LAYER 1: Validate email format (fail fast → 400)
    this.validateEmailAddress(to);

    // LAYER 2: Per-recipient rate limiting (fail fast → 429)
    await this.rateLimitService.checkRateLimit(to);

    // LAYER 3: Enqueue for async processing
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

  // ==========================================================================
  // VALIDATION (Phase 4)
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

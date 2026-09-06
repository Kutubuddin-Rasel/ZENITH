// src/email/services/email-dispatch.service.ts
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as emailValidator from 'email-validator';
import { EMAIL_RATE_LIMITER_TOKEN } from '../constants/email.tokens';
import {
  EMAIL_JOB_NAMES,
  EMAIL_QUEUE_NAME,
  EmailDeliveryReceipt,
  EmailJobData,
  EmailJobName,
  GenericEmailSpec,
  IEmailDispatch,
  IEmailRateLimiter,
  IEmailSender,
  InvitationEmailSpec,
  ReportEmailSpec,
  TokenLinkEmailSpec,
} from '../interfaces/email.interfaces';
import { buildEmailJobId } from '../utils/job-id.util';

/** Advertised lifetime of a scheduled-report download link. */
const DEFAULT_REPORT_EXPIRY_HOURS = 48;

// ============================================================================
// EMAIL DISPATCH SERVICE (PRODUCER)
//
// A pure BullMQ producer — it validates, rate-limits, and enqueues. It NEVER
// touches a mail provider; delivery happens in `EmailProcessor` behind
// `IEmailTransport`. Preserving that split is the point: an HTTP request must
// never block on an outbound SMTP/API round trip.
//
// SECURITY LAYERS, in order:
//   1. Address validation   — format check, fail fast → 400
//   2. Per-recipient limit  — Redis counters, fail fast → 429
//   3. Enqueue              — persisted to Redis for at-least-once delivery
//   4. Escaping             — Handlebars (body) + sanitizeSubject (header),
//                             applied downstream at composition time
//
// Implements TWO segregated contracts on one class deliberately: the typed
// domain producers (`IEmailDispatch`) and the generic channel (`IEmailSender`)
// share validation, throttling, and enqueue mechanics. They are bound to
// SEPARATE tokens so consumers still only ever see the half they need — the
// notifications adapter cannot reach `sendReport`.
// ============================================================================

@Injectable()
export class EmailDispatchService implements IEmailDispatch, IEmailSender {
  private readonly logger = new Logger(EmailDispatchService.name);

  constructor(
    @InjectQueue(EMAIL_QUEUE_NAME)
    private readonly emailQueue: Queue<EmailJobData, EmailDeliveryReceipt>,
    @Inject(EMAIL_RATE_LIMITER_TOKEN)
    private readonly rateLimiter: IEmailRateLimiter,
  ) {}

  // ==========================================================================
  // TYPED DOMAIN PRODUCERS (IEmailDispatch)
  // ==========================================================================

  async sendInvitation(spec: InvitationEmailSpec): Promise<void> {
    await this.enqueue({
      type: EMAIL_JOB_NAMES.SEND_INVITATION,
      to: spec.to,
      inviteLink: spec.inviteLink,
      inviterName: spec.inviterName,
      orgName: spec.orgName,
    });
  }

  async sendTokenLink(spec: TokenLinkEmailSpec): Promise<void> {
    await this.enqueue({
      type: EMAIL_JOB_NAMES.SEND_TOKEN_LINK,
      to: spec.to,
      purpose: spec.purpose,
      link: spec.link,
      expiresIn: spec.expiresIn,
      userName: spec.userName,
    });
  }

  async sendReport(spec: ReportEmailSpec): Promise<void> {
    await this.enqueue({
      type: EMAIL_JOB_NAMES.SEND_REPORT,
      to: spec.to,
      projectName: spec.projectName,
      reportType: spec.reportType,
      s3ObjectKey: spec.s3ObjectKey,
      expiresInHours: spec.expiresInHours ?? DEFAULT_REPORT_EXPIRY_HOURS,
    });
  }

  // ==========================================================================
  // GENERIC CHANNEL (IEmailSender)
  // ==========================================================================

  async send(spec: GenericEmailSpec): Promise<void> {
    await this.enqueue({
      type: EMAIL_JOB_NAMES.SEND_GENERIC,
      to: spec.to,
      subject: spec.subject,
      body: spec.body,
    });
  }

  // ==========================================================================
  // SHARED PIPELINE
  // ==========================================================================

  /**
   * Validate → throttle → enqueue. The single path every producer takes, so a
   * new email type cannot accidentally skip a security layer.
   *
   * The job's `type` discriminant doubles as its BullMQ job name — one value,
   * so the queue's routing key and the payload's tag can never disagree.
   */
  private async enqueue(data: EmailJobData): Promise<void> {
    this.assertValidAddress(data.to);
    await this.rateLimiter.check(data.to);

    const jobName: EmailJobName = data.type;

    // Deterministic jobId → O(1) dedup. BullMQ refuses an add() whose id is
    // already resident, so a duplicated event or a caller retry collapses into
    // the job already queued instead of sending the recipient two copies.
    const job = await this.emailQueue.add(jobName, data, {
      jobId: buildEmailJobId(data),
    });

    this.logger.log(
      `Queued ${jobName} for ${data.to} — Job ID: ${job.id ?? 'unknown'}`,
    );
  }

  /**
   * @throws BadRequestException when the address is malformed. Runs BEFORE the
   *   rate-limit check so a typo cannot burn a recipient's quota.
   */
  private assertValidAddress(email: string): void {
    if (!email || !emailValidator.validate(email)) {
      throw new BadRequestException(`Invalid email address format: "${email}"`);
    }
  }
}

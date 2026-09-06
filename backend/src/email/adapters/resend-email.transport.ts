// src/email/adapters/resend-email.transport.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  EmailDeliveryReceipt,
  IEmailTransport,
  OutboundEmail,
} from '../interfaces/email.interfaces';

// ============================================================================
// TYPE DEFINITIONS
//
// The `resend` SDK's send() return type is wider than what we consume; these
// narrow it to the two fields that matter, keeping the `any` count at zero.
// ============================================================================

interface ResendError {
  message: string;
  name?: string;
}

interface ResendResponse {
  data: { id: string } | null;
  error: ResendError | null;
}

/**
 * The only `IEmailTransport` implementation — Resend HTTP API.
 *
 * WHY THIS IS A SEPARATE CLASS: the SDK client used to be constructed inside
 * `EmailProcessor`, which meant the BullMQ worker owned a vendor connection and
 * could not be unit-tested without reaching the network. Composition, retry
 * semantics, and delivery were one untestable knot. Now the worker depends on
 * `EMAIL_TRANSPORT_TOKEN` and a test binds a fake.
 *
 * This is a deliberate single-implementation port (see the contract's docblock):
 * it exists for testability and to fulfil the notifications module's
 * `EmailTransportPort`, NOT to support a provider zoo. Do not add SES/SendGrid
 * adapters speculatively.
 *
 * MOCK MODE: with no `RESEND_API_KEY` the transport logs instead of sending and
 * returns a `mock-` receipt. This is the ONLY local-dev path — every developer
 * without a Resend key depends on it, so it is preserved exactly as it behaved
 * inside the old processor.
 *
 * FAILURE SEMANTICS: provider errors THROW. That is deliberate — the throw
 * propagates out of `EmailProcessor.process()` and BullMQ applies its retry
 * policy (3 attempts, exponential backoff from `CoreQueueModule`). Swallowing
 * the error here would silently convert a retryable failure into a lost email.
 */
@Injectable()
export class ResendEmailTransport implements IEmailTransport {
  private readonly logger = new Logger(ResendEmailTransport.name);
  private readonly client: Resend | null;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (apiKey) {
      this.client = new Resend(apiKey);
    } else {
      this.client = null;
      this.logger.warn(
        'RESEND_API_KEY is not defined. Emails will be logged to console only.',
      );
    }

    this.fromAddress =
      this.configService.get<string>('EMAIL_FROM') || 'onboarding@resend.dev';
  }

  async deliver(message: OutboundEmail): Promise<EmailDeliveryReceipt> {
    const { to, subject, html } = message;

    if (!this.client) {
      this.logger.log(`[MOCK EMAIL] To: ${to}, Subject: ${subject}`);
      return this.receipt(`mock-${Date.now()}`, to);
    }

    const response = (await this.client.emails.send({
      from: this.fromAddress,
      to: [to],
      subject,
      html,
    })) as ResendResponse;

    if (response.error) {
      this.logger.error(
        `Resend API error for ${to}: ${response.error.message}`,
      );
      throw new Error(`Resend API error: ${response.error.message}`);
    }

    const messageId = response.data?.id ?? 'unknown';
    this.logger.log(`Email sent to ${to}, Resend ID: ${messageId}`);

    return this.receipt(messageId, to);
  }

  private receipt(messageId: string, recipient: string): EmailDeliveryReceipt {
    return { messageId, recipient, sentAt: new Date().toISOString() };
  }
}

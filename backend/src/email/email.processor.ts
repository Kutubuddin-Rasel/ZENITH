import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import {
  EMAIL_COMPOSER_REGISTRY_TOKEN,
  EMAIL_TRANSPORT_TOKEN,
} from './constants/email.tokens';
import {
  EMAIL_QUEUE_NAME,
  EmailDeliveryReceipt,
  EmailJobData,
  IEmailComposerRegistry,
  IEmailTransport,
} from './interfaces/email.interfaces';

// ============================================================================
// EMAIL PROCESSOR (CONSUMER)
//
// Two lines of real work: compose, then deliver. Everything it used to do
// inline now lives behind a contract —
//
//   job name → composer   : `IEmailComposerRegistry` (O(1), Open/Closed)
//   payload  → OutboundEmail : the composers (per-type copy + escaping)
//   OutboundEmail → sent  : `IEmailTransport` (the Resend seam)
//   URL allowlist         : `EmailLinkPolicy` + pure `link-policy.util`
//
// That matters beyond tidiness: this class previously constructed its own
// `Resend` client, which made the worker impossible to unit-test without
// network access, and buried the outbound-link security policy in private
// methods with no test coverage at all.
//
// EXTENSIBILITY — adding an email type:
//   1. Add a payload member to the `EmailJobData` union (with its `type` tag)
//   2. Add a composer class + one line in the registry
//   3. Add a .hbs template
//   Zero changes to this file.
//
// RETRY: inherits CoreQueueModule defaults (3 attempts, exp backoff 1s→2s→4s).
// A throw from compose or deliver is a RETRY signal — never swallow one here.
// ============================================================================

@Processor(EMAIL_QUEUE_NAME)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    @Inject(EMAIL_COMPOSER_REGISTRY_TOKEN)
    private readonly composers: IEmailComposerRegistry,
    @Inject(EMAIL_TRANSPORT_TOKEN)
    private readonly transport: IEmailTransport,
  ) {
    super();
  }

  async process(
    job: Job<EmailJobData, EmailDeliveryReceipt, string>,
  ): Promise<EmailDeliveryReceipt | undefined> {
    this.logger.log(
      `Processing email job ${job.id} [${job.name}] attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 3}`,
    );

    const composer = this.composers.resolve(job.name);
    if (!composer) {
      // Unknown name — return rather than throw. Retrying would fail
      // identically, so a retry loop would only add noise.
      this.logger.warn(`Unknown email job name: ${job.name}`);
      return undefined;
    }

    const message = await composer.compose(job.data);
    const receipt = await this.transport.deliver(message);

    this.logger.log(
      `Job ${job.id}: delivered to ${receipt.recipient} (${receipt.messageId})`,
    );

    return receipt;
  }
}

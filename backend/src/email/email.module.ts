import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CacheModule } from '../cache/cache.module';
import { S3StorageProvider } from '../attachments/storage/providers/s3-storage.provider';

import {
  EMAIL_COMPOSER_REGISTRY_TOKEN,
  EMAIL_DISPATCH_TOKEN,
  EMAIL_RATE_LIMITER_TOKEN,
  EMAIL_SENDER_TOKEN,
  EMAIL_TEMPLATE_RENDERER_TOKEN,
  EMAIL_TRANSPORT_TOKEN,
} from './constants/email.tokens';
import { DownloadLinkPort } from './ports/download-link.port';

import { EmailRateLimitService } from './email-rate-limit.service';
import { EmailTemplateService } from './email-template.service';
import { EmailProcessor } from './email.processor';

import { EmailDispatchService } from './services/email-dispatch.service';
import { EmailLinkPolicy } from './services/email-link-policy.service';

import { EmailComposerRegistry } from './composers/email-composer.registry';
import { GenericComposer } from './composers/generic.composer';
import { InvitationComposer } from './composers/invitation.composer';
import { ReportComposer } from './composers/report.composer';
import { TokenLinkComposer } from './composers/token-link.composer';

import { ResendEmailTransport } from './adapters/resend-email.transport';
import { S3DownloadLinkAdapter } from './adapters/s3-download-link.adapter';

import { InvitationCreatedListener } from './listeners/invitation-created.listener';
import { TokenLinkListener } from './listeners/token-link.listener';

/**
 * Email Module — physical delivery for the whole application.
 *
 * ARCHITECTURE (Step 2)
 * ---------------------
 * Producer/consumer split across a BullMQ queue, with every seam behind a
 * token:
 *
 *   caller → EMAIL_DISPATCH_TOKEN / EMAIL_SENDER_TOKEN   (validate, throttle,
 *            └─ EmailDispatchService                       enqueue — no I/O)
 *                        ↓  'email' queue (CoreQueueModule)
 *   EmailProcessor → EMAIL_COMPOSER_REGISTRY_TOKEN → composer  (payload → HTML)
 *                  → EMAIL_TRANSPORT_TOKEN                     (HTML → Resend)
 *
 * Outbound dependencies are ports, not concrete classes:
 *   - `EMAIL_TRANSPORT_TOKEN` → `ResendEmailTransport` — the vendor seam. The
 *     SDK client used to be built inside the worker's constructor, which made
 *     the worker untestable without network access.
 *   - `DownloadLinkPort` → `S3DownloadLinkAdapter` — presigned report links,
 *     with a REQUIRED ttl so the link's lifetime and the "valid for N hours"
 *     copy cannot drift apart again.
 *
 * TWO TOKENS, ONE CLASS: `EmailDispatchService` is bound to both
 * `EMAIL_DISPATCH_TOKEN` (typed domain producers) and `EMAIL_SENDER_TOKEN`
 * (generic `send`) via `useExisting`, so both resolve to the SAME singleton
 * while consumers still see only the half they need. `notifications` gets
 * `send()` and cannot reach `sendReport`.
 *
 * EVENT LISTENERS: `invitation.created`, `user.email-verification-requested`,
 * and `auth.2fa-recovery-requested` are consumed here. The emitting modules
 * (`organizations`, `auth`) do not import this module and this module does not
 * import them — the event bus is the only coupling.
 */
@Module({
  imports: [ConfigModule, CacheModule],
  providers: [
    // ---- Producer: bound to two segregated tokens, one instance ----------
    EmailDispatchService,
    { provide: EMAIL_DISPATCH_TOKEN, useExisting: EmailDispatchService },
    { provide: EMAIL_SENDER_TOKEN, useExisting: EmailDispatchService },

    // ---- Consumer -------------------------------------------------------
    EmailProcessor,

    // ---- Internal collaborators behind their contracts -------------------
    EmailRateLimitService,
    { provide: EMAIL_RATE_LIMITER_TOKEN, useExisting: EmailRateLimitService },
    EmailTemplateService,
    {
      provide: EMAIL_TEMPLATE_RENDERER_TOKEN,
      useExisting: EmailTemplateService,
    },
    EmailLinkPolicy,

    // ---- Composition: one composer per job name, O(1) registry -----------
    InvitationComposer,
    TokenLinkComposer,
    ReportComposer,
    GenericComposer,
    EmailComposerRegistry,
    {
      provide: EMAIL_COMPOSER_REGISTRY_TOKEN,
      useExisting: EmailComposerRegistry,
    },

    // ---- Outbound ports --------------------------------------------------
    { provide: EMAIL_TRANSPORT_TOKEN, useClass: ResendEmailTransport },
    { provide: DownloadLinkPort, useClass: S3DownloadLinkAdapter },
    // Concrete backend for the adapter above. Declared here rather than taken
    // from the global FILE_STORAGE_PROVIDER because report artifacts are
    // uploaded S3-only (`uploadStream`), so the read side must resolve to S3
    // even when STORAGE_PROVIDER=local.
    S3StorageProvider,

    // ---- Inbound event listeners ----------------------------------------
    InvitationCreatedListener,
    TokenLinkListener,
  ],
  // Tokens only — never a concrete class. Consumers speak `IEmailDispatch` /
  // `IEmailSender` and cannot reach the processor, composers, or transport.
  exports: [EMAIL_DISPATCH_TOKEN, EMAIL_SENDER_TOKEN],
})
export class EmailModule {}

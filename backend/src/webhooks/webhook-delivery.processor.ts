import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as https from 'https';
import { Webhook } from './entities/webhook.entity';
import { WebhookLog } from './entities/webhook-log.entity';
import { EncryptionService } from '../common/services/encryption.service';
import {
  WEBHOOK_DELIVERY_QUEUE,
  WebhookDeliveryJobData,
} from './webhook-delivery.interfaces';

// ============================================================================
// WEBHOOK DELIVERY PROCESSOR (BullMQ Consumer)
//
// ARCHITECTURE:
//   EventEmitter → WebhooksService.trigger() → BullMQ Queue → THIS PROCESSOR
//
// RELIABILITY:
//   - Jobs survive server restarts (persisted in Redis)
//   - 3 attempts with exponential backoff (1s → 2s → 4s) via CoreQueueModule
//   - removeOnFail: false — failed jobs stay for dead letter analysis
//
// SECURITY:
//   - Decrypts HMAC secret in-memory only (AES-256-GCM via EncryptionService)
//   - TLS 1.2+ enforced, self-signed certs rejected
//   - Plaintext secret never logged
// ============================================================================

@Processor(WEBHOOK_DELIVERY_QUEUE)
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  /**
   * Hardened TLS agent — rejects self-signed certs + legacy TLS.
   * Reused across all deliveries (connection pooling).
   */
  private readonly tlsAgent = new https.Agent({
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  });

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepo: Repository<Webhook>,
    @InjectRepository(WebhookLog)
    private readonly logRepo: Repository<WebhookLog>,
    private readonly encryptionService: EncryptionService,
  ) {
    super();
  }

  /**
   * Process a single webhook delivery job.
   *
   * BullMQ calls this for each job. On throw, BullMQ retries
   * with exponential backoff (configured in CoreQueueModule).
   */
  async process(job: Job<WebhookDeliveryJobData, void, string>): Promise<void> {
    const { webhookId, event, payload } = job.data;

    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId },
    });

    if (!webhook) {
      this.logger.warn(
        `Webhook ${webhookId} not found — skipping delivery (job ${job.id})`,
      );
      return; // Don't retry — webhook was deleted
    }

    if (!webhook.isActive) {
      this.logger.debug(`Webhook ${webhookId} is disabled — skipping delivery`);
      return;
    }

    await this.deliver(webhook, event, payload, job.attemptsMade);
  }

  /**
   * Execute the HTTP delivery to the customer's endpoint.
   *
   * On non-2xx response or network error, throws to trigger BullMQ retry.
   * Logs all attempts (success and failure) to WebhookLog.
   */
  private async deliver(
    webhook: Webhook,
    event: string,
    payload: object,
    attempt: number,
  ): Promise<void> {
    const startTime = Date.now();
    const webhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    // SECURITY: Decrypt HMAC secret in-memory only for signing.
    // The plaintext secret never leaves this scope and is never logged.
    const plainSecret = this.encryptionService.decrypt(webhook.secret);

    const signature = crypto
      .createHmac('sha256', plainSecret)
      .update(JSON.stringify(webhookPayload))
      .digest('hex');

    try {
      // TLS-hardened fetch
      const isHttps = webhook.url.startsWith('https://');
      const fetchOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body: JSON.stringify(webhookPayload),
        signal: AbortSignal.timeout(5000),
      };

      if (isHttps) {
        // @ts-expect-error Node.js internal fetch supports dispatcher
        fetchOptions.dispatcher = this.tlsAgent;
      }

      const response = await fetch(webhook.url, fetchOptions);
      const responseBody = await response.text();
      const deliveryDuration = Date.now() - startTime;

      // Log delivery attempt
      await this.logRepo.save({
        webhookId: webhook.id,
        event,
        payload: webhookPayload,
        responseStatus: response.status,
        responseBody: responseBody.substring(0, 1000),
        deliveryDuration,
        success: response.ok,
      });

      if (response.ok) {
        // Success — reset failure counter
        await this.webhookRepo.update(webhook.id, {
          lastTriggeredAt: new Date(),
          failureCount: 0,
        });
      } else {
        // Non-2xx — increment failure counter
        const newFailureCount = webhook.failureCount + 1;
        await this.webhookRepo.update(webhook.id, {
          lastTriggeredAt: new Date(),
          failureCount: newFailureCount,
        });

        // Auto-disable after 10 consecutive failures
        if (newFailureCount >= 10) {
          await this.webhookRepo.update(webhook.id, { isActive: false });
          this.logger.warn(
            `Webhook ${webhook.id} auto-disabled after ${newFailureCount} consecutive failures`,
          );
          return; // Don't retry — webhook is now disabled
        }

        // Throw to trigger BullMQ retry
        throw new Error(
          `Webhook delivery failed: HTTP ${response.status} (attempt ${attempt + 1})`,
        );
      }
    } catch (error) {
      const deliveryDuration = Date.now() - startTime;

      // Log network/TLS errors (but not re-thrown HTTP errors — already logged above)
      if (
        !(
          error instanceof Error &&
          error.message.startsWith('Webhook delivery failed')
        )
      ) {
        await this.logRepo.save({
          webhookId: webhook.id,
          event,
          payload: webhookPayload,
          responseStatus: 0,
          responseBody: (error as Error).message,
          deliveryDuration,
          success: false,
        });

        const newFailureCount = webhook.failureCount + 1;
        await this.webhookRepo.update(webhook.id, {
          lastTriggeredAt: new Date(),
          failureCount: newFailureCount,
        });

        if (newFailureCount >= 10) {
          await this.webhookRepo.update(webhook.id, { isActive: false });
          this.logger.warn(
            `Webhook ${webhook.id} auto-disabled after ${newFailureCount} consecutive failures`,
          );
          return; // Don't retry
        }
      }

      // Re-throw to trigger BullMQ retry with exponential backoff
      throw error;
    }
  }
}

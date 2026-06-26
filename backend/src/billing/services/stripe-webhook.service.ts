/**
 * Stripe Webhook Service — Billing Module.
 *
 * RELOCATED from organizations module (Step 4).
 *
 * OCP FIX: The monolithic switch statement in dispatchEvent() has been
 * replaced with a Map<string, IStripeEventHandler> strategy pattern.
 * New Stripe events = new handler class, zero switch modification.
 *
 * ARCHITECTURE:
 * - Signature verification (Stripe SDK)
 * - Idempotency (Redis-based event deduplication)
 * - Strategy-based event dispatch
 * - Audit logging for all billing state changes
 *
 * CROSS-DOMAIN ACCESS:
 * Injects OrganizationRepository (abstract) — NOT OrganizationsModule
 * or OrganizationsService. This is the DIP boundary.
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { OrganizationRepository } from '../../organizations/repositories/abstract/organization.repository.abstract';
import { AuditLogsService } from '../../audit/audit-logs.service';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { IStripeEventHandler } from '../interfaces/stripe-event-handler.interface';
import { SubscriptionUpdatedHandler } from './webhooks/subscription-updated.handler';
import { SubscriptionDeletedHandler } from './webhooks/subscription-deleted.handler';
import { PaymentSucceededHandler } from './webhooks/payment-succeeded.handler';
import { PaymentFailedHandler } from './webhooks/payment-failed.handler';
import { CheckoutCompletedHandler } from './webhooks/checkout-completed.handler';

// =============================================================================
// CONSTANTS
// =============================================================================

const STRIPE_EVENT_KEY_PREFIX = 'stripe_event:' as const;
const STRIPE_EVENT_IDEMPOTENCY_TTL_SECONDS = 86400;

// =============================================================================
// TYPES
// =============================================================================

interface WebhookProcessingResult {
  readonly received: true;
  readonly eventId: string;
  readonly eventType: string;
  readonly processed: boolean;
  readonly skipped?: boolean;
  readonly reason?: string;
}

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;

  /** OCP: Strategy map — event type → handler */
  private readonly handlerMap: Map<string, IStripeEventHandler>;

  constructor(
    private readonly configService: ConfigService,
    private readonly orgRepo: OrganizationRepository,
    private readonly auditLogsService: AuditLogsService,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
    subscriptionUpdated: SubscriptionUpdatedHandler,
    subscriptionDeleted: SubscriptionDeletedHandler,
    paymentSucceeded: PaymentSucceededHandler,
    paymentFailed: PaymentFailedHandler,
    checkoutCompleted: CheckoutCompletedHandler,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (apiKey) {
      this.stripe = new Stripe(apiKey);
    } else {
      this.stripe = null;
      this.logger.warn(
        'STRIPE_SECRET_KEY not configured — webhook processing disabled',
      );
    }

    // OCP: Register handlers — add new handlers here, no switch needed
    const handlers: IStripeEventHandler[] = [
      subscriptionUpdated,
      subscriptionDeleted,
      paymentSucceeded,
      paymentFailed,
      checkoutCompleted,
    ];

    this.handlerMap = new Map(handlers.map((h) => [h.eventType, h]));
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  async handleWebhook(
    signature: string,
    rawBody: Buffer,
  ): Promise<WebhookProcessingResult> {
    if (!this.stripe || !this.webhookSecret) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
      );
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Stripe signature verification failed: ${message}`);
      throw new BadRequestException(
        `Webhook signature verification failed: ${message}`,
      );
    }

    const isDuplicate = await this.isEventProcessed(event.id);
    if (isDuplicate) {
      this.logger.debug(
        `Stripe event ${event.id} (${event.type}) already processed — skipping`,
      );
      return {
        received: true,
        eventId: event.id,
        eventType: event.type,
        processed: false,
        skipped: true,
        reason: 'duplicate_event',
      };
    }

    // OCP: Lookup handler from strategy map
    const handler = this.handlerMap.get(event.type);
    if (!handler) {
      this.logger.debug(`Unhandled Stripe event type: ${event.type} — acking`);
      return {
        received: true,
        eventId: event.id,
        eventType: event.type,
        processed: false,
        reason: 'unhandled_event_type',
      };
    }

    try {
      const org = await this.findOrgByCustomerId(event);
      if (!org) {
        return {
          received: true,
          eventId: event.id,
          eventType: event.type,
          processed: false,
          reason: 'organization_not_found',
        };
      }

      await handler.handle(event, org, event.id);
      await this.markEventProcessed(event.id);

      this.logger.log(`Stripe event processed: ${event.type} (${event.id})`);

      return {
        received: true,
        eventId: event.id,
        eventType: event.type,
        processed: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to process Stripe event ${event.id} (${event.type}): ${message}`,
      );
      throw new InternalServerErrorException(
        'Webhook processing failed — event will be retried',
      );
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private async findOrgByCustomerId(event: Stripe.Event) {
    const dataObject = event.data.object as {
      customer?: string | { id: string } | null;
    };
    const customer = dataObject.customer;
    if (!customer) {
      this.logger.warn('Stripe event has no customer — skipping');
      return null;
    }
    const customerId = typeof customer === 'string' ? customer : customer.id;
    const org = await this.orgRepo.findByCustomerId(customerId);
    if (!org) {
      this.logger.warn(
        `No organization found for Stripe customer ${customerId}`,
      );
    }
    return org;
  }

  private async isEventProcessed(eventId: string): Promise<boolean> {
    try {
      return this.cacheStore.exists(`${STRIPE_EVENT_KEY_PREFIX}${eventId}`);
    } catch {
      this.logger.warn(
        `Redis unavailable for idempotency check on ${eventId} — processing anyway`,
      );
      return false;
    }
  }

  private async markEventProcessed(eventId: string): Promise<void> {
    try {
      await this.cacheStore.set(`${STRIPE_EVENT_KEY_PREFIX}${eventId}`, '1', {
        ttl: STRIPE_EVENT_IDEMPOTENCY_TTL_SECONDS,
      });
    } catch {
      this.logger.warn(
        `Failed to mark Stripe event ${eventId} as processed in Redis`,
      );
    }
  }
}

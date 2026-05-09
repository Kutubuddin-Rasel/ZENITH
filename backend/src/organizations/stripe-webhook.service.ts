/**
 * Stripe Webhook Service — Handles Stripe Event Processing for Organizations
 *
 * ARCHITECTURE:
 * This service owns the Stripe webhook lifecycle for organization billing:
 *   1. Signature verification (Stripe SDK)
 *   2. Idempotency check (Redis-based event deduplication)
 *   3. Event dispatch to typed handlers
 *   4. Audit logging for all billing state changes
 *
 * IDEMPOTENCY STRATEGY:
 * Stripe can replay events (retries on 5xx, manual resends from dashboard).
 * We use Redis SET with TTL to track processed event IDs:
 *   Key:   stripe_event:{event.id}
 *   Value: '1'
 *   TTL:   24 hours (Stripe retries for up to 72h, 24h covers 99%)
 *
 * Flow: CHECK → PROCESS → MARK
 * If the event ID exists in Redis, we return 200 immediately (idempotent).
 * If processing fails, we DON'T mark — Stripe will retry and we'll reprocess.
 *
 * HANDLED EVENTS:
 * - customer.subscription.updated  → Update org status + period
 * - customer.subscription.deleted  → Mark org as canceled
 * - invoice.payment_succeeded      → Confirm active status
 * - invoice.payment_failed         → Mark org as past_due
 * - checkout.session.completed     → Link subscription to org
 *
 * SECURITY:
 * - Stripe signature verification prevents forged events
 * - Raw body is required (parsed in main.ts, not JSON)
 * - No authentication guard (Stripe can't send JWTs)
 * - Rate limited by global ThrottlerGuard
 *
 * @see https://stripe.com/docs/webhooks/signatures
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Organization } from './entities/organization.entity';
import { OrganizationSettingsService } from './organization-settings.service';
import { AuditLogsService } from '../audit/audit-logs.service';
import { CACHE_STORE_TOKEN } from '../cache/constants/cache.tokens';
import { ICacheStore } from '../cache/interfaces/cache.interfaces';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Redis key prefix for Stripe event deduplication */
const STRIPE_EVENT_KEY_PREFIX = 'stripe_event:' as const;

/** TTL for processed event markers (24 hours in seconds) */
const STRIPE_EVENT_IDEMPOTENCY_TTL_SECONDS = 86400;

/** Events we care about — everything else is acknowledged but ignored */
const HANDLED_EVENTS = new Set<string>([
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'checkout.session.completed',
]);

// =============================================================================
// TYPES
// =============================================================================

/** Result of webhook processing */
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

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    private readonly settingsService: OrganizationSettingsService,
    private readonly auditLogsService: AuditLogsService,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
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
  }

  // ===========================================================================
  // PUBLIC API (Called by Controller)
  // ===========================================================================

  /**
   * Process a raw Stripe webhook payload.
   *
   * FLOW:
   *   1. Verify signature (reject forged events)
   *   2. Check idempotency (skip already-processed events)
   *   3. Dispatch to typed handler
   *   4. Mark event as processed in Redis
   *   5. Return acknowledgment
   *
   * @param signature - Stripe-Signature header value
   * @param rawBody - Raw request body (Buffer, NOT parsed JSON)
   * @returns Processing result
   */
  async handleWebhook(
    signature: string,
    rawBody: Buffer,
  ): Promise<WebhookProcessingResult> {
    // Gate 1: Configuration check
    if (!this.stripe || !this.webhookSecret) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
      );
    }

    // Gate 2: Signature verification
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

    // Gate 3: Idempotency — skip already-processed events
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

    // Gate 4: Unhandled event type — acknowledge but don't process
    if (!HANDLED_EVENTS.has(event.type)) {
      this.logger.debug(`Unhandled Stripe event type: ${event.type} — acking`);
      return {
        received: true,
        eventId: event.id,
        eventType: event.type,
        processed: false,
        reason: 'unhandled_event_type',
      };
    }

    // ==== DISPATCH TO HANDLER ====
    try {
      await this.dispatchEvent(event);

      // Mark as processed AFTER successful handling
      await this.markEventProcessed(event.id);

      this.logger.log(`Stripe event processed: ${event.type} (${event.id})`);

      return {
        received: true,
        eventId: event.id,
        eventType: event.type,
        processed: true,
      };
    } catch (error) {
      // DON'T mark as processed — let Stripe retry
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
  // EVENT DISPATCH
  // ===========================================================================

  /**
   * Route Stripe event to the correct typed handler.
   * Each handler receives the strongly-typed data object from the SDK.
   */
  private async dispatchEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object, event.id);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object, event.id);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object, event.id);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object, event.id);
        break;

      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object, event.id);
        break;
    }
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  /**
   * customer.subscription.updated
   *
   * Fired when subscription status changes (trialing → active, etc.)
   * or when the billing period renews.
   */
  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
    eventId: string,
  ): Promise<void> {
    const org = await this.findOrgByCustomerId(subscription.customer);
    if (!org) return;

    const previousStatus = org.subscriptionStatus;
    org.stripeSubscriptionId = subscription.id;
    org.subscriptionStatus = subscription.status;
    org.currentPeriodEnd = this.extractCurrentPeriodEnd(subscription);
    await this.orgRepo.save(org);

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: org.id,
      actor_id: 'stripe_webhook',
      resource_type: 'Subscription',
      resource_id: subscription.id,
      action_type: 'UPDATE',
      action: 'SUBSCRIPTION_UPDATED',
      metadata: {
        severity: 'HIGH',
        stripeEventId: eventId,
        previousStatus,
        newStatus: subscription.status,
        currentPeriodEnd: org.currentPeriodEnd.toISOString(),
        organizationName: org.name,
      },
    });
  }

  /**
   * customer.subscription.deleted
   *
   * Fired when a subscription is canceled and the cancellation takes effect.
   * This is the final "subscription is gone" event.
   */
  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
    eventId: string,
  ): Promise<void> {
    const org = await this.findOrgByCustomerId(subscription.customer);
    if (!org) return;

    const previousStatus = org.subscriptionStatus;
    org.subscriptionStatus = 'canceled';
    org.currentPeriodEnd = this.extractCurrentPeriodEnd(subscription);
    await this.orgRepo.save(org);

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: org.id,
      actor_id: 'stripe_webhook',
      resource_type: 'Subscription',
      resource_id: subscription.id,
      action_type: 'DELETE',
      action: 'SUBSCRIPTION_CANCELLED',
      metadata: {
        severity: 'CRITICAL',
        stripeEventId: eventId,
        previousStatus,
        organizationName: org.name,
      },
    });

    this.logger.warn(`Subscription CANCELLED for org ${org.id} (${org.name})`);
  }

  /**
   * invoice.payment_succeeded
   *
   * Fired when a recurring payment succeeds. Confirms active status.
   */
  private async handlePaymentSucceeded(
    invoice: Stripe.Invoice,
    eventId: string,
  ): Promise<void> {
    const org = await this.findOrgByCustomerId(invoice.customer);
    if (!org) return;

    // Only update if currently in a non-active state
    if (org.subscriptionStatus !== 'active') {
      const previousStatus = org.subscriptionStatus;
      org.subscriptionStatus = 'active';
      await this.orgRepo.save(org);

      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: org.id,
        actor_id: 'stripe_webhook',
        resource_type: 'Invoice',
        resource_id: invoice.id,
        action_type: 'UPDATE',
        action: 'PAYMENT_SUCCEEDED',
        metadata: {
          severity: 'MEDIUM',
          stripeEventId: eventId,
          previousStatus,
          amountPaid: invoice.amount_paid,
          organizationName: org.name,
        },
      });
    }
  }

  /**
   * invoice.payment_failed
   *
   * Fired when a recurring payment fails. Marks org as past_due.
   * Stripe will retry based on the retry schedule configured in the dashboard.
   */
  private async handlePaymentFailed(
    invoice: Stripe.Invoice,
    eventId: string,
  ): Promise<void> {
    const org = await this.findOrgByCustomerId(invoice.customer);
    if (!org) return;

    const previousStatus = org.subscriptionStatus;
    org.subscriptionStatus = 'past_due';
    await this.orgRepo.save(org);

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: org.id,
      actor_id: 'stripe_webhook',
      resource_type: 'Invoice',
      resource_id: invoice.id,
      action_type: 'UPDATE',
      action: 'PAYMENT_FAILED',
      metadata: {
        severity: 'CRITICAL',
        stripeEventId: eventId,
        previousStatus,
        amountDue: invoice.amount_due,
        attemptCount: invoice.attempt_count,
        organizationName: org.name,
      },
    });

    this.logger.warn(
      `Payment FAILED for org ${org.id} (${org.name}) — attempt ${invoice.attempt_count}`,
    );
  }

  /**
   * checkout.session.completed
   *
   * Fired when a customer completes Stripe Checkout.
   * Links the subscription ID to the organization.
   */
  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
    eventId: string,
  ): Promise<void> {
    const org = await this.findOrgByCustomerId(session.customer);
    if (!org) return;

    if (session.subscription) {
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;

      org.stripeSubscriptionId = subscriptionId;
      org.subscriptionStatus = 'active';
      await this.orgRepo.save(org);

      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: org.id,
        actor_id: 'stripe_webhook',
        resource_type: 'Checkout',
        resource_id: session.id,
        action_type: 'CREATE',
        action: 'CHECKOUT_COMPLETED',
        metadata: {
          severity: 'HIGH',
          stripeEventId: eventId,
          subscriptionId,
          organizationName: org.name,
        },
      });
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Find organization by Stripe customer ID.
   *
   * Stripe sends the customer as either a string or an expanded object.
   * This method handles both cases.
   *
   * @returns Organization or null (with warning log)
   */
  private async findOrgByCustomerId(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): Promise<Organization | null> {
    if (!customer) {
      this.logger.warn('Stripe event has no customer — skipping');
      return null;
    }

    const customerId = typeof customer === 'string' ? customer : customer.id;

    const org = await this.orgRepo.findOne({
      where: { stripeCustomerId: customerId },
    });

    if (!org) {
      this.logger.warn(
        `No organization found for Stripe customer ${customerId}`,
      );
    }

    return org;
  }

  /**
   * Extract current_period_end from a Stripe Subscription.
   *
   * STRIPE V20 BREAKING CHANGE:
   * current_period_end was removed from the top-level Subscription type.
   * It now lives on SubscriptionItem (subscription.items.data[0].current_period_end).
   *
   * Fallback chain:
   *   1. First subscription item's current_period_end
   *   2. cancel_at (if subscription is being canceled at period end)
   *   3. Current timestamp (defensive fallback)
   */
  private extractCurrentPeriodEnd(subscription: Stripe.Subscription): Date {
    const firstItem = subscription.items?.data?.[0];
    if (firstItem?.current_period_end) {
      return new Date(firstItem.current_period_end * 1000);
    }

    if (subscription.cancel_at) {
      return new Date(subscription.cancel_at * 1000);
    }

    this.logger.warn(
      `Could not extract current_period_end for subscription ${subscription.id} — using current time`,
    );
    return new Date();
  }

  // ===========================================================================
  // IDEMPOTENCY (Redis-based Event Deduplication)
  // ===========================================================================

  /**
   * Check if a Stripe event has already been processed.
   *
   * @param eventId - Stripe event ID (e.g., 'evt_1N...')
   * @returns true if the event was already processed
   */
  private async isEventProcessed(eventId: string): Promise<boolean> {
    try {
      return this.cacheStore.exists(`${STRIPE_EVENT_KEY_PREFIX}${eventId}`);
    } catch {
      // Fail-open: if Redis is down, process the event
      // (idempotent handlers should be safe to reprocess)
      this.logger.warn(
        `Redis unavailable for idempotency check on ${eventId} — processing anyway`,
      );
      return false;
    }
  }

  /**
   * Mark a Stripe event as processed.
   *
   * Called AFTER successful processing. If processing fails,
   * the event is NOT marked — Stripe will retry.
   *
   * @param eventId - Stripe event ID
   */
  private async markEventProcessed(eventId: string): Promise<void> {
    try {
      await this.cacheStore.set(`${STRIPE_EVENT_KEY_PREFIX}${eventId}`, '1', {
        ttl: STRIPE_EVENT_IDEMPOTENCY_TTL_SECONDS,
      });
    } catch {
      // Non-fatal: worst case, the event gets processed again (idempotent)
      this.logger.warn(
        `Failed to mark Stripe event ${eventId} as processed in Redis`,
      );
    }
  }
}

/**
 * SubscriptionDeletedHandler — Handles customer.subscription.deleted events.
 */

import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { Organization } from '../../../organizations/entities/organization.entity';
import { IStripeEventHandler } from '../../interfaces/stripe-event-handler.interface';
import { OrganizationRepository } from '../../../organizations/repositories/abstract/organization.repository.abstract';
import { AuditLogsService } from '../../../audit/audit-logs.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SubscriptionDeletedHandler implements IStripeEventHandler {
  readonly eventType = 'customer.subscription.deleted';
  private readonly logger = new Logger(SubscriptionDeletedHandler.name);

  constructor(
    private readonly orgRepo: OrganizationRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async handle(
    event: Stripe.Event,
    org: Organization,
    eventId: string,
  ): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const previousStatus = org.subscriptionStatus;
    const periodEnd = this.extractCurrentPeriodEnd(subscription);

    await this.orgRepo.updateSubscriptionStatus(org.id, 'canceled', {
      currentPeriodEnd: periodEnd,
    });

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

  private extractCurrentPeriodEnd(subscription: Stripe.Subscription): Date {
    const firstItem = subscription.items?.data?.[0];
    if (firstItem?.current_period_end) {
      return new Date(firstItem.current_period_end * 1000);
    }
    if (subscription.cancel_at) {
      return new Date(subscription.cancel_at * 1000);
    }
    return new Date();
  }
}

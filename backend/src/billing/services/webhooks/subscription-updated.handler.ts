/**
 * SubscriptionUpdatedHandler — Handles customer.subscription.updated events.
 */

import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { Organization } from '../../../organizations/entities/organization.entity';
import { IStripeEventHandler } from '../../interfaces/stripe-event-handler.interface';
import { OrganizationRepository } from '../../../organizations/repositories/abstract/organization.repository.abstract';
import { AuditLogsService } from '../../../audit/audit-logs.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SubscriptionUpdatedHandler implements IStripeEventHandler {
  readonly eventType = 'customer.subscription.updated';
  private readonly logger = new Logger(SubscriptionUpdatedHandler.name);

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

    await this.orgRepo.updateSubscriptionStatus(org.id, subscription.status, {
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: periodEnd,
    });

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
        currentPeriodEnd: periodEnd.toISOString(),
        organizationName: org.name,
      },
    });
  }

  private extractCurrentPeriodEnd(subscription: Stripe.Subscription): Date {
    const firstItem = subscription.items?.data?.[0];
    if (firstItem?.current_period_end) {
      return new Date(firstItem.current_period_end * 1000);
    }
    if (subscription.cancel_at) {
      return new Date(subscription.cancel_at * 1000);
    }
    this.logger.warn(
      `Could not extract current_period_end for subscription ${subscription.id}`,
    );
    return new Date();
  }
}

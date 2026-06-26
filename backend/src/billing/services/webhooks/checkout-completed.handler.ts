/**
 * CheckoutCompletedHandler — Handles checkout.session.completed events.
 */

import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { Organization } from '../../../organizations/entities/organization.entity';
import { IStripeEventHandler } from '../../interfaces/stripe-event-handler.interface';
import { OrganizationRepository } from '../../../organizations/repositories/abstract/organization.repository.abstract';
import { AuditLogsService } from '../../../audit/audit-logs.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CheckoutCompletedHandler implements IStripeEventHandler {
  readonly eventType = 'checkout.session.completed';

  constructor(
    private readonly orgRepo: OrganizationRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async handle(
    event: Stripe.Event,
    org: Organization,
    eventId: string,
  ): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.subscription) {
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;

      await this.orgRepo.updateSubscriptionStatus(org.id, 'active', {
        stripeSubscriptionId: subscriptionId,
      });

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
}

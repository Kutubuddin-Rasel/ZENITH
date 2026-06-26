/**
 * PaymentSucceededHandler — Handles invoice.payment_succeeded events.
 */

import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { Organization } from '../../../organizations/entities/organization.entity';
import { IStripeEventHandler } from '../../interfaces/stripe-event-handler.interface';
import { OrganizationRepository } from '../../../organizations/repositories/abstract/organization.repository.abstract';
import { AuditLogsService } from '../../../audit/audit-logs.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentSucceededHandler implements IStripeEventHandler {
  readonly eventType = 'invoice.payment_succeeded';

  constructor(
    private readonly orgRepo: OrganizationRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async handle(
    event: Stripe.Event,
    org: Organization,
    eventId: string,
  ): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;

    if (org.subscriptionStatus !== 'active') {
      const previousStatus = org.subscriptionStatus;
      await this.orgRepo.updateSubscriptionStatus(org.id, 'active');

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
}

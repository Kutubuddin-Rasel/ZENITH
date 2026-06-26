/**
 * PaymentFailedHandler — Handles invoice.payment_failed events.
 */

import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { Organization } from '../../../organizations/entities/organization.entity';
import { IStripeEventHandler } from '../../interfaces/stripe-event-handler.interface';
import { OrganizationRepository } from '../../../organizations/repositories/abstract/organization.repository.abstract';
import { AuditLogsService } from '../../../audit/audit-logs.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentFailedHandler implements IStripeEventHandler {
  readonly eventType = 'invoice.payment_failed';
  private readonly logger = new Logger(PaymentFailedHandler.name);

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
    const previousStatus = org.subscriptionStatus;

    await this.orgRepo.updateSubscriptionStatus(org.id, 'past_due');

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
}

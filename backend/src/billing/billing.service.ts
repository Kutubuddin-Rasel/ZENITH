import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Organization } from '../organizations/entities/organization.entity';
import { AuditLogsService } from '../audit/audit-logs.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BillingService {
  private stripe: Stripe;
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    private auditLogsService: AuditLogsService,
    private eventEmitter: EventEmitter2,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey);
    } else {
      this.logger.warn('STRIPE_SECRET_KEY not defined');
    }
  }

  async createCheckoutSession(
    orgId: string,
    priceId: string,
    actorId: string = 'system',
  ) {
    const org = await this.orgRepo.findOneBy({ id: orgId });
    if (!org) throw new BadRequestException('Organization not found');

    // Create customer if not exists
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        name: org.name,
        metadata: { orgId },
      });
      customerId = customer.id;
      org.stripeCustomerId = customerId;
      await this.orgRepo.save(org);
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.configService.get('FRONTEND_URL')}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.configService.get('FRONTEND_URL')}/billing/cancel`,
      subscription_data: {
        metadata: { orgId },
      },
    });

    // Audit: BILLING_CHECKOUT_INITIATED
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: orgId,
      actor_id: actorId,
      resource_type: 'Billing',
      resource_id: session.id,
      action_type: 'CREATE',
      action: 'BILLING_CHECKOUT_INITIATED',
      metadata: {
        priceId,
        customerId,
        organizationName: org.name,
      },
    });

    return { url: session.url };
  }

  async createPortalSession(orgId: string) {
    const org = await this.orgRepo.findOneBy({ id: orgId });
    if (!org || !org.stripeCustomerId)
      throw new BadRequestException('No billing account found');

    const session = await this.stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${this.configService.get('FRONTEND_URL')}/settings/billing`,
    });

    return { url: session.url };
  }

  async handleWebhook(signature: string, payload: Buffer) {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    if (!webhookSecret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET not configured');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch (err) {
      throw new BadRequestException(`Webhook Error: ${(err as Error).message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        this.handleCheckoutDefined(event.data.object);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        break;
      case 'customer.subscription.trial_will_end':
        await this.handleTrialWillEnd(event.data.object);
        break;
      case 'invoice.upcoming':
        await this.handleInvoiceUpcoming(event.data.object);
        break;
      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  // ─── Existing Webhook Handlers ───────────────────────

  private handleCheckoutDefined(session: Stripe.Checkout.Session) {
    // Logic to finalize subscription if needed
    this.logger.log(`Checkout completed for ${session.customer as string}`);
  }

  private async handleSubscriptionUpdated(sub: Stripe.Subscription) {
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const org = await this.orgRepo.findOneBy({ stripeCustomerId: customerId });

    if (org) {
      const previousStatus = org.subscriptionStatus;
      org.stripeSubscriptionId = sub.id;
      org.subscriptionStatus = sub.status;
      // Cast to custom type or unknown first
      const subWithPeriod = sub as unknown as { current_period_end: number };
      org.currentPeriodEnd = new Date(subWithPeriod.current_period_end * 1000);
      await this.orgRepo.save(org);

      // Audit: SUBSCRIPTION_UPDATED (Severity: CRITICAL if cancelled)
      const severity = sub.status === 'canceled' ? 'CRITICAL' : 'HIGH';
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: org.id,
        actor_id: 'stripe_webhook',
        resource_type: 'Subscription',
        resource_id: sub.id,
        action_type: 'UPDATE',
        action:
          sub.status === 'canceled'
            ? 'SUBSCRIPTION_CANCELLED'
            : 'SUBSCRIPTION_UPDATED',
        metadata: {
          severity,
          previousStatus,
          newStatus: sub.status,
          organizationName: org.name,
        },
      });

      this.logger.log(
        `Updated subscription for org ${org.id} to ${sub.status}`,
      );
    }
  }

  // ─── New Webhook Handlers ────────────────────────────

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const org = await this.findOrgByStripeCustomer(invoice.customer as string);
    if (!org) return;

    this.logger.warn(`Payment failed for org ${org.id}, invoice ${invoice.id}`);

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: org.id,
      actor_id: 'stripe_webhook',
      resource_type: 'Invoice',
      resource_id: invoice.id,
      action_type: 'UPDATE',
      action: 'INVOICE_PAYMENT_FAILED',
      metadata: {
        severity: 'CRITICAL',
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        attemptCount: invoice.attempt_count,
        nextPaymentAttempt: invoice.next_payment_attempt,
        organizationName: org.name,
      },
    });

    this.eventEmitter.emit('billing.payment_failed', {
      orgId: org.id,
      invoiceId: invoice.id,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      organizationName: org.name,
    });
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const org = await this.findOrgByStripeCustomer(invoice.customer as string);
    if (!org) return;

    this.logger.log(
      `Payment succeeded for org ${org.id}, invoice ${invoice.id}`,
    );

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: org.id,
      actor_id: 'stripe_webhook',
      resource_type: 'Invoice',
      resource_id: invoice.id,
      action_type: 'UPDATE',
      action: 'INVOICE_PAYMENT_SUCCEEDED',
      metadata: {
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        organizationName: org.name,
      },
    });

    this.eventEmitter.emit('billing.payment_succeeded', {
      orgId: org.id,
      invoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
    });
  }

  private async handleTrialWillEnd(sub: Stripe.Subscription): Promise<void> {
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const org = await this.findOrgByStripeCustomer(customerId);
    if (!org) return;

    this.logger.log(`Trial ending soon for org ${org.id}`);

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: org.id,
      actor_id: 'stripe_webhook',
      resource_type: 'Subscription',
      resource_id: sub.id,
      action_type: 'UPDATE',
      action: 'SUBSCRIPTION_TRIAL_ENDING',
      metadata: {
        severity: 'HIGH',
        trialEnd: sub.trial_end,
        organizationName: org.name,
      },
    });

    this.eventEmitter.emit('billing.trial_will_end', {
      orgId: org.id,
      subscriptionId: sub.id,
      trialEnd: sub.trial_end,
      organizationName: org.name,
    });
  }

  private async handleInvoiceUpcoming(invoice: Stripe.Invoice): Promise<void> {
    const org = await this.findOrgByStripeCustomer(invoice.customer as string);
    if (!org) return;

    this.logger.log(`Upcoming invoice for org ${org.id}`);

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: org.id,
      actor_id: 'stripe_webhook',
      resource_type: 'Invoice',
      resource_id: invoice.id ?? 'upcoming',
      action_type: 'CREATE',
      action: 'INVOICE_UPCOMING',
      metadata: {
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        dueDate: invoice.due_date,
        organizationName: org.name,
      },
    });

    this.eventEmitter.emit('billing.invoice_upcoming', {
      orgId: org.id,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
    });
  }

  // ─── Invoice History ─────────────────────────────────

  async listInvoices(
    orgId: string,
    limit: number = 10,
    startingAfter?: string,
  ) {
    const org = await this.orgRepo.findOneBy({ id: orgId });
    if (!org || !org.stripeCustomerId) {
      throw new NotFoundException(
        'No billing account found for this organization',
      );
    }

    const params: Stripe.InvoiceListParams = {
      customer: org.stripeCustomerId,
      limit: Math.min(limit, 100),
    };
    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    const invoices = await this.stripe.invoices.list(params);

    return {
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountDue: inv.amount_due,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        created: new Date(inv.created * 1000),
        dueDate: inv.due_date ? new Date(inv.due_date * 1000) : null,
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoicePdf: inv.invoice_pdf,
      })),
      hasMore: invoices.has_more,
    };
  }

  // ─── Shared Helpers ──────────────────────────────────

  private async findOrgByStripeCustomer(
    customerId: string,
  ): Promise<Organization | null> {
    const org = await this.orgRepo.findOneBy({
      stripeCustomerId: customerId,
    });
    if (!org) {
      this.logger.warn(
        `No organization found for Stripe customer ${customerId}`,
      );
    }
    return org;
  }
}

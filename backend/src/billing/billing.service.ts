import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Organization } from '../organizations/entities/organization.entity';

@Injectable()
export class BillingService {
  private stripe: Stripe;
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey);
    } else {
      this.logger.warn('STRIPE_SECRET_KEY not defined');
    }
  }

  async createCheckoutSession(orgId: string, priceId: string) {
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
    }
  }

  private handleCheckoutDefined(session: Stripe.Checkout.Session) {
    // Logic to finalize subscription if needed
    this.logger.log(`Checkout completed for ${session.customer as string}`);
  }

  private async handleSubscriptionUpdated(sub: Stripe.Subscription) {
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const org = await this.orgRepo.findOneBy({ stripeCustomerId: customerId });

    if (org) {
      org.stripeSubscriptionId = sub.id;
      org.subscriptionStatus = sub.status;
      // Cast to custom type or unknown first
      const subWithPeriod = sub as unknown as { current_period_end: number };
      org.currentPeriodEnd = new Date(subWithPeriod.current_period_end * 1000);
      await this.orgRepo.save(org);
      this.logger.log(
        `Updated subscription for org ${org.id} to ${sub.status}`,
      );
    }
  }
}

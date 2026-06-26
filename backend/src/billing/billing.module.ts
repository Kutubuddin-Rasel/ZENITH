import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { UsageService } from './usage.service';
import { Organization } from '../organizations/entities/organization.entity';
import { UsageRecord } from './entities/usage-record.entity';
// Stripe Webhook (relocated from organizations module — Step 4)
import { StripeWebhookService } from './services/stripe-webhook.service';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
// OCP Strategy Handlers
import { SubscriptionUpdatedHandler } from './services/webhooks/subscription-updated.handler';
import { SubscriptionDeletedHandler } from './services/webhooks/subscription-deleted.handler';
import { PaymentSucceededHandler } from './services/webhooks/payment-succeeded.handler';
import { PaymentFailedHandler } from './services/webhooks/payment-failed.handler';
import { CheckoutCompletedHandler } from './services/webhooks/checkout-completed.handler';
// DIP: Cross-domain access via abstract repository (no OrganizationsModule import)
import { OrganizationsModule } from '../organizations/organizations.module';
import { CacheModule } from '../cache/cache.module';

/**
 * Billing Module — Stripe Webhook + Usage Tracking.
 *
 * SRP REFACTOR (Step 4):
 * StripeWebhookService + StripeWebhookController relocated here.
 * OrganizationRepository is imported from OrganizationsModule (exported token),
 * NOT the concrete class or OrganizationsService.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Organization, UsageRecord]),
    OrganizationsModule, // Provides OrganizationRepository export
    CacheModule, // Redis for webhook idempotency
  ],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    BillingService,
    UsageService,
    // Stripe Webhook
    StripeWebhookService,
    // OCP: Strategy handlers (injected into StripeWebhookService)
    SubscriptionUpdatedHandler,
    SubscriptionDeletedHandler,
    PaymentSucceededHandler,
    PaymentFailedHandler,
    CheckoutCompletedHandler,
  ],
  exports: [BillingService, UsageService],
})
export class BillingModule {}

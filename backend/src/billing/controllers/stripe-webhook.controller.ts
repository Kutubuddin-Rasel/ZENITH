/**
 * Stripe Webhook Controller — Billing Module.
 *
 * RELOCATED from organizations module (Step 4).
 * Route changed: POST /billing/webhook/stripe
 *
 * @see StripeWebhookService for business logic
 */

import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { StripeWebhookService } from '../services/stripe-webhook.service';

interface RawBodyRequest extends Request {
  body: Buffer;
}

@Controller('billing')
export class StripeWebhookController {
  constructor(private readonly stripeWebhookService: StripeWebhookService) {}

  @Public()
  @Post('webhook/stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() req: RawBodyRequest,
  ): Promise<{
    received: true;
    eventId: string;
    eventType: string;
    processed: boolean;
    skipped?: boolean;
    reason?: string;
  }> {
    if (!signature) {
      throw new BadRequestException(
        'Missing stripe-signature header — this endpoint only accepts Stripe webhook events',
      );
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    return this.stripeWebhookService.handleWebhook(signature, rawBody);
  }
}

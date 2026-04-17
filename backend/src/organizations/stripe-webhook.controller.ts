/**
 * Stripe Webhook Controller — HTTP Entry Point for Stripe Events
 *
 * SECURITY:
 * - NO authentication guards (Stripe can't send JWTs)
 * - Signature verification handled by StripeWebhookService
 * - Raw body required for signature verification (configured in main.ts)
 * - Rate limited by global ThrottlerGuard (APP_GUARD)
 *
 * RAW BODY:
 * main.ts registers `bodyParser.raw({ type: 'application/json' })`
 * specifically for the `/billing/webhook` path. This captures the raw
 * Buffer BEFORE JSON parsing, which is required for Stripe's HMAC
 * signature verification. The global JSON parser is NOT affected.
 *
 * ROUTE: POST /organizations/webhook/stripe
 *
 * @see StripeWebhookService for business logic
 * @see main.ts line 170-173 for raw body middleware configuration
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
import { Public } from '../auth/decorators/public.decorator';
import { StripeWebhookService } from './stripe-webhook.service';

// =============================================================================
// TYPE: Express Request with raw body (set by bodyParser.raw in main.ts)
// =============================================================================

/**
 * Express Request augmented with the raw body Buffer.
 * Set by `bodyParser.raw()` middleware in main.ts for webhook routes.
 */
interface RawBodyRequest extends Request {
  body: Buffer;
}

// =============================================================================
// CONTROLLER
// =============================================================================

@Controller('organizations')
export class StripeWebhookController {
  constructor(
    private readonly stripeWebhookService: StripeWebhookService,
  ) {}

  /**
   * POST /organizations/webhook/stripe
   *
   * Receives Stripe webhook events.
   *
   * IMPORTANT:
   * - @Public() bypasses JwtAuthGuard — Stripe can't authenticate with JWT
   * - Returns 200 on success (Stripe treats 2xx as acknowledgment)
   * - Returns 400 on bad signature (Stripe will NOT retry)
   * - Returns 500 on processing failure (Stripe WILL retry with backoff)
   *
   * IDEMPOTENCY:
   * Stripe may send the same event multiple times (retries, manual resend).
   * The service layer deduplicates via Redis-backed event ID tracking.
   */
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

    // req.body is a Buffer when bodyParser.raw() is used
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    return this.stripeWebhookService.handleWebhook(signature, rawBody);
  }
}

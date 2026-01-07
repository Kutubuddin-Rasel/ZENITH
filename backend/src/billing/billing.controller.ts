import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { Request } from 'express';
import { RequireCsrf } from '../security/csrf/csrf.guard';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @RequireCsrf()
  async createCheckout(
    @Req() req: { user: JwtRequestUser },
    @Body() body: { priceId: string; orgId: string },
  ) {
    // In production, verify user.orgId matches body.orgId and user is Admin
    return this.billingService.createCheckoutSession(body.orgId, body.priceId);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  @RequireCsrf()
  async createPortal(
    @Req() req: { user: JwtRequestUser },
    @Body() body: { orgId: string },
  ) {
    return this.billingService.createPortalSession(body.orgId);
  }

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    // Use raw body for verification
    const rawBody = (req as unknown as { rawBody: Buffer }).rawBody || req.body;
    // Note: NestJS raw body handling requires setup in main.ts

    // For this implementation, we assume we receive Buffer if properly configured
    return this.billingService.handleWebhook(signature, rawBody);
  }
}

import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Req,
  Query,
  UseGuards,
  ForbiddenException,
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
    this.assertBillingAuthorization(req.user, body.orgId);
    return this.billingService.createCheckoutSession(
      body.orgId,
      body.priceId,
      req.user.userId,
    );
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  @RequireCsrf()
  async createPortal(
    @Req() req: { user: JwtRequestUser },
    @Body() body: { orgId: string },
  ) {
    this.assertBillingAuthorization(req.user, body.orgId);
    return this.billingService.createPortalSession(body.orgId);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  async getInvoices(
    @Req() req: { user: JwtRequestUser },
    @Query('orgId') orgId: string,
    @Query('limit') limit?: string,
    @Query('starting_after') startingAfter?: string,
  ) {
    this.assertBillingAuthorization(req.user, orgId);
    return this.billingService.listInvoices(
      orgId,
      Number(limit) || 10,
      startingAfter,
    );
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

  /**
   * Centralized billing authorization check.
   * Validates the requesting user belongs to the target org and holds SuperAdmin privileges.
   *
   * Why isSuperAdmin: No granular `billing:admin` permission exists in the RBAC system yet.
   * isSuperAdmin is the strictest available gate and prevents unauthorized billing operations.
   */
  private assertBillingAuthorization(
    user: JwtRequestUser,
    targetOrgId: string,
  ): void {
    if (!user.organizationId || user.organizationId !== targetOrgId) {
      throw new ForbiddenException('You do not belong to this organization');
    }
    if (!user.isSuperAdmin) {
      throw new ForbiddenException(
        'Billing operations require admin privileges',
      );
    }
  }
}

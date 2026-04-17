import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationInvitation } from './entities/organization-invitation.entity';
import { OrganizationSettings } from './entities/organization-settings.entity';
import { OrganizationsService } from './organizations.service';
import { OrganizationSettingsService } from './organization-settings.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { OrganizationsController } from './organizations.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { UsersModule } from '../users/users.module';
import { MembershipModule } from '../membership/membership.module';
import { EmailModule } from '../email/email.module';
import { CsrfModule } from '../security/csrf/csrf.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      OrganizationInvitation,
      OrganizationSettings,
    ]),
    UsersModule,
    MembershipModule,
    EmailModule,
    CsrfModule,       // CsrfGuard DI resolution
    CacheModule,       // Redis for webhook idempotency
  ],
  providers: [
    OrganizationsService,
    OrganizationSettingsService,
    StripeWebhookService,
  ],
  controllers: [OrganizationsController, StripeWebhookController],
  exports: [OrganizationsService, OrganizationSettingsService],
})
export class OrganizationsModule {}

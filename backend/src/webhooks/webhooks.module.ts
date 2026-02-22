import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { Webhook } from './entities/webhook.entity';
import { WebhookLog } from './entities/webhook-log.entity';
import { MembershipModule } from '../membership/membership.module';
import { CsrfModule } from '../security/csrf/csrf.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook, WebhookLog]),
    MembershipModule, // Provides ProjectMembersService for authorization
    CsrfModule, // Provides StatefulCsrfGuard for CSRF protection
    CommonModule, // Provides EncryptionService for secret encryption at rest
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryProcessor],
  exports: [WebhooksService],
})
export class WebhooksModule {}

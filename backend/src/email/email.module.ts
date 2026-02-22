import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailRateLimitService } from './email-rate-limit.service';
import { EmailProcessor } from './email.processor';
import { EmailTemplateService } from './email-template.service';

@Module({
  imports: [ConfigModule],
  providers: [
    EmailService,
    EmailRateLimitService,
    EmailProcessor,
    EmailTemplateService,
  ],
  exports: [EmailService],
})
export class EmailModule {}

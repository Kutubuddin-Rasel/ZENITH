import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailRateLimitService } from './email-rate-limit.service';
import { EmailProcessor } from './email.processor';
import { EmailTemplateService } from './email-template.service';
import { S3StorageProvider } from '../attachments/storage/providers/s3-storage.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    EmailService,
    EmailRateLimitService,
    EmailProcessor,
    EmailTemplateService,
    S3StorageProvider,
  ],
  exports: [EmailService],
})
export class EmailModule { }

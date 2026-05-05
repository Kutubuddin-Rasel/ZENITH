import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { UsageService } from './usage.service';
import { Organization } from '../organizations/entities/organization.entity';
import { UsageRecord } from './entities/usage-record.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Organization, UsageRecord]),
  ],
  controllers: [BillingController],
  providers: [BillingService, UsageService],
  exports: [BillingService, UsageService],
})
export class BillingModule {}

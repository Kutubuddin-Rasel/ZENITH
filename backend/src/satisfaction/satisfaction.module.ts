import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SatisfactionMetric } from './entities/satisfaction-metric.entity';
import { SatisfactionSurvey } from './entities/satisfaction-survey.entity';
import { SatisfactionService } from './satisfaction.service';
import { SatisfactionController } from './satisfaction.controller';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SatisfactionMetric, SatisfactionSurvey]),
    MembershipModule,
  ],
  providers: [SatisfactionService],
  controllers: [SatisfactionController],
  exports: [SatisfactionService],
})
export class SatisfactionModule {}

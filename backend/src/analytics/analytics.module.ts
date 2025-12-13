import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { CycleTimeService } from './services/cycle-time.service';
import { SprintRiskService } from './services/sprint-risk.service';
import { RevisionsModule } from '../revisions/revisions.module';
import { IssuesModule } from '../issues/issues.module';
import { SprintsModule } from '../sprints/sprints.module';
import { MembershipModule } from '../membership/membership.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [RevisionsModule, IssuesModule, SprintsModule, MembershipModule, CacheModule],
  controllers: [AnalyticsController],
  providers: [CycleTimeService, SprintRiskService],
  exports: [CycleTimeService, SprintRiskService],
})
export class AnalyticsModule { }

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsController } from './analytics.controller';
import { CycleTimeService } from './services/cycle-time.service';
import { SprintRiskService } from './services/sprint-risk.service';
import { AnalyticsJobsService } from './services/analytics-jobs.service';
import { RevisionsModule } from '../revisions/revisions.module';
import { IssuesModule } from '../issues/issues.module';
import { SprintsModule } from '../sprints/sprints.module';
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService
import { CacheModule } from '../cache/cache.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    RevisionsModule,
    IssuesModule,
    // REFACTORED: SprintsModule no longer causes cycle - direct import
    SprintsModule,
    // REFACTORED: Removed MembershipModule - ProjectCoreModule is global
    CacheModule,
    // REFACTORED: NotificationsModule no longer causes cycle - direct import
    NotificationsModule,
  ],
  controllers: [AnalyticsController],
  providers: [CycleTimeService, SprintRiskService, AnalyticsJobsService],
  exports: [CycleTimeService, SprintRiskService, AnalyticsJobsService],
})
export class AnalyticsModule { }

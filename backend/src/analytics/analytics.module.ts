import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { CycleTimeService } from './services/cycle-time.service';
import { SprintRiskService } from './services/sprint-risk.service';
import { AnalyticsJobsService } from './services/analytics-jobs.service';
import { HistoricalMetricsService } from './services/historical-metrics.service';
import { ProjectMetrics } from './entities/project-metrics.entity';
import { RevisionsModule } from '../revisions/revisions.module';
import { IssuesModule } from '../issues/issues.module';
import { SprintsModule } from '../sprints/sprints.module';
import { CacheModule } from '../cache/cache.module';
import { NotificationsModule } from '../notifications/notifications.module';
// Phase 5: Alerting
import { AlertingService } from './alerting/alerting.service';
import { SlackAlertProvider } from './alerting/providers/slack-alert.provider';
import { PagerDutyAlertProvider } from './alerting/providers/pagerduty-alert.provider';
import { AlertsProcessor } from './alerting/processors/alerts.processor';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([ProjectMetrics]),
    RevisionsModule,
    IssuesModule,
    SprintsModule,
    CacheModule,
    NotificationsModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    CycleTimeService,
    SprintRiskService,
    AnalyticsJobsService,
    HistoricalMetricsService,
    // Phase 5: Alerting pipeline
    SlackAlertProvider,
    PagerDutyAlertProvider,
    AlertingService,
    AlertsProcessor,
  ],
  exports: [
    CycleTimeService,
    SprintRiskService,
    AnalyticsJobsService,
    HistoricalMetricsService,
  ],
})
export class AnalyticsModule {}

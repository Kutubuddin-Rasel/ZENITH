import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { CycleTimeCalculator } from './services/cycle-time.calculator';
import { CycleTimeQueryService } from './services/cycle-time-query.service';
import { SprintRiskQueryService } from './services/sprint-risk-query.service';
import { StalledIssuesQueryService } from './services/stalled-issues-query.service';
import { AnalyticsAggregationJobService } from './services/analytics-aggregation-job.service';
import { HistoricalMetricsQueryService } from './services/historical-metrics-query.service';
import { ProjectMetrics } from './entities/project-metrics.entity';
import { RevisionsModule } from '../revisions/revisions.module';
import { IssuesModule } from '../issues/issues.module';
import { SprintsModule } from '../sprints/sprints.module';
import { CacheModule } from '../cache/cache.module';
// Phase 5: Alerting
import { AlertingService } from './alerting/alerting.service';
import { SlackAlertProvider } from './alerting/providers/slack-alert.provider';
import { PagerDutyAlertProvider } from './alerting/providers/pagerduty-alert.provider';
import { AlertsProcessor } from './alerting/processors/alerts.processor';
import {
  CYCLE_TIME_QUERY_TOKEN,
  SPRINT_RISK_QUERY_TOKEN,
  HISTORICAL_METRICS_QUERY_TOKEN,
  STALLED_ISSUES_QUERY_TOKEN,
  ANALYTICS_AGGREGATION_JOB_TOKEN,
  ANALYTICS_READ_MODEL_TOKEN,
  PROJECT_METRICS_REPOSITORY_TOKEN,
} from './constants/analytics.tokens';
import { PostgresAnalyticsReadRepository } from './repositories/postgres/postgres-analytics-read.repository';
import { TypeormProjectMetricsRepository } from './repositories/postgres/typeorm-project-metrics.repository';

/**
 * OUTBOUND PORTS (Step 2): the OLTP read model and the `ProjectMetrics`
 * rollup are bound to their Postgres implementations behind dialect-free
 * tokens. Swapping these two `useClass` targets for `ClickHouse*` impls is
 * the entire surface of the planned OLAP migration — no service touched.
 */
const ANALYTICS_PORT_BINDINGS = [
  {
    provide: ANALYTICS_READ_MODEL_TOKEN,
    useClass: PostgresAnalyticsReadRepository,
  },
  {
    provide: PROJECT_METRICS_REPOSITORY_TOKEN,
    useClass: TypeormProjectMetricsRepository,
  },
];

/**
 * SERVICE-SURFACE BINDINGS (Step 3): the Step-1 strangler aliases (which all
 * pointed at the legacy god-services via `useExisting`) are now repointed onto
 * the decomposed CQRS services with ZERO call-site churn — every consumer
 * still injects the same token. The CQRS straddle is resolved: the
 * stalled-issues READ and the cron WRITE that both lived on `AnalyticsJobsService`
 * are now two distinct services (`StalledIssuesQueryService` vs
 * `AnalyticsAggregationJobService`). The legacy concrete services are no longer
 * registered (Step 4 deletes the files).
 */
const ANALYTICS_SERVICE_BINDINGS = [
  { provide: CYCLE_TIME_QUERY_TOKEN, useExisting: CycleTimeQueryService },
  { provide: SPRINT_RISK_QUERY_TOKEN, useExisting: SprintRiskQueryService },
  {
    provide: HISTORICAL_METRICS_QUERY_TOKEN,
    useExisting: HistoricalMetricsQueryService,
  },
  {
    provide: STALLED_ISSUES_QUERY_TOKEN,
    useExisting: StalledIssuesQueryService,
  },
  {
    provide: ANALYTICS_AGGREGATION_JOB_TOKEN,
    useExisting: AnalyticsAggregationJobService,
  },
];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([ProjectMetrics]),
    RevisionsModule,
    IssuesModule,
    SprintsModule,
    CacheModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    // Decomposed CQRS services (Step 3) — each implements one ISP surface.
    CycleTimeCalculator,
    CycleTimeQueryService,
    SprintRiskQueryService,
    StalledIssuesQueryService,
    AnalyticsAggregationJobService,
    HistoricalMetricsQueryService,
    ...ANALYTICS_PORT_BINDINGS,
    ...ANALYTICS_SERVICE_BINDINGS,
    // Phase 5: Alerting pipeline
    SlackAlertProvider,
    PagerDutyAlertProvider,
    AlertingService,
    AlertsProcessor,
  ],
  // SEALED (Step 4): NO `exports`. Analytics is a terminal Level-3 reporting
  // module with zero external consumers (blast radius 1 — only `app.module`
  // registers it by direct path). Every surface is module-internal; the
  // `index.ts` barrel re-exports only the ISP contracts + DI tokens, and the
  // `ANALYTICS_DEEP_IMPORT_PATTERNS` lint bans any deep reach into internals.
})
export class AnalyticsModule {}

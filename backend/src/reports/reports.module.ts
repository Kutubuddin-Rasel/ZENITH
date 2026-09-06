import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsController } from './reports.controller';
import { ScheduledReportsCronService } from './services/scheduled-reports-cron.service';
import { ScheduledReportsProcessor } from './processors/scheduled-reports.processor';
import { SprintsModule } from 'src/sprints/sprints.module';
import { AuthModule } from 'src/auth/auth.module';
import { RevisionsModule } from 'src/revisions/revisions.module';
import { MembershipModule } from 'src/membership/membership.module';
import { EmailModule } from 'src/email/email.module';
import { Issue } from 'src/issues/entities/issue.entity';
import { SprintIssue } from 'src/sprints/entities/sprint-issue.entity';
import { Project } from 'src/projects/entities/project.entity';
// S3 provider for scheduled report uploads
import { S3StorageProvider } from 'src/attachments/storage/providers/s3-storage.provider';

import { CacheModule } from '../cache/cache.module';

// Step 2 — external ports: format adapters (library isolation) + the OLTP read
// seam, bound behind the Step-1 tokens.
import {
  REPORT_FORMATTER_TOKEN,
  REPORT_DATA_PROVIDER_TOKEN,
  REPORT_EXPORTER_TOKEN,
  REPORTS_READ_MODEL_TOKEN,
} from './constants/reports.tokens';
import type {
  IReportFormatter,
  IReportDataProvider,
} from './interfaces/reports.interfaces';
import { PdfReportFormatter } from './formatters/pdf-report.formatter';
import { XlsxReportFormatter } from './formatters/xlsx-report.formatter';
import { CsvReportFormatter } from './formatters/csv-report.formatter';
import { PostgresReportsReadRepository } from './repositories/postgres/postgres-reports-read.repository';

// Step 3 — CQRS read facade + per-report data providers (one strategy per
// ReportType), the two O(1) dispatch registries, and the export facade. As of
// Step 4 these are the ONLY data/export path: the legacy
// `ReportsService`/`PdfExportService`/`ExcelExportService` god-classes were
// deleted (`git rm`), so the module no longer registers them.
import { ReportQueryService } from './services/report-query.service';
import { VelocityReportProvider } from './providers/velocity-report.provider';
import { BurndownReportProvider } from './providers/burndown-report.provider';
import { CumulativeFlowReportProvider } from './providers/cumulative-flow-report.provider';
import { EpicProgressReportProvider } from './providers/epic-progress-report.provider';
import { IssueBreakdownReportProvider } from './providers/issue-breakdown-report.provider';
import { ReportProviderRegistry } from './services/report-provider.registry';
import { ReportFormatterRegistry } from './services/report-formatter.registry';
import { ReportExportService } from './services/report-export.service';
@Module({
  imports: [
    ScheduleModule.forRoot(),
    // ProjectMember intentionally absent — scheduled-reports.processor
    // now reads through PROJECT_MEMBER_QUERY_TOKEN (exported by the
    // already-imported MembershipModule) instead of @InjectRepository.
    TypeOrmModule.forFeature([Issue, SprintIssue, Project]),
    SprintsModule,
    AuthModule,
    RevisionsModule,
    MembershipModule,
    EmailModule,
    CacheModule,
  ],
  controllers: [ReportsController],
  providers: [
    // Scheduled reports pipeline
    ScheduledReportsCronService,
    ScheduledReportsProcessor,
    S3StorageProvider,
    // --- Step 2 external ports ---
    // OLTP read seam (ClickHouse-swappable behind the token).
    {
      provide: REPORTS_READ_MODEL_TOKEN,
      useClass: PostgresReportsReadRepository,
    },
    // Format strategies, registered individually so they are injectable…
    PdfReportFormatter,
    XlsxReportFormatter,
    CsvReportFormatter,
    // …then collected into one array token. NestJS has no Angular-style
    // `multi: true`, so the canonical idiom is a factory that returns the
    // strategy array; ReportFormatterRegistry folds it into an O(1)
    // Map<ReportFormat, IReportFormatter>.
    {
      provide: REPORT_FORMATTER_TOKEN,
      useFactory: (
        pdf: PdfReportFormatter,
        xlsx: XlsxReportFormatter,
        csv: CsvReportFormatter,
      ): IReportFormatter[] => [pdf, xlsx, csv],
      inject: [PdfReportFormatter, XlsxReportFormatter, CsvReportFormatter],
    },
    // --- Step 3 CQRS read facade + providers + registries + export facade ---
    // Single source of truth for raw report reads (cache + tenant resolution);
    // consumed by both the controller (JSON) and the providers (tables).
    ReportQueryService,
    // One IReportDataProvider strategy per ReportType, registered individually…
    VelocityReportProvider,
    BurndownReportProvider,
    CumulativeFlowReportProvider,
    EpicProgressReportProvider,
    IssueBreakdownReportProvider,
    // …then folded into the data-provider array token (same factory-array idiom
    // as the formatters); ReportProviderRegistry keys it by reportType.
    {
      provide: REPORT_DATA_PROVIDER_TOKEN,
      useFactory: (
        velocity: VelocityReportProvider,
        burndown: BurndownReportProvider,
        cumulativeFlow: CumulativeFlowReportProvider,
        epicProgress: EpicProgressReportProvider,
        issueBreakdown: IssueBreakdownReportProvider,
      ): IReportDataProvider[] => [
        velocity,
        burndown,
        cumulativeFlow,
        epicProgress,
        issueBreakdown,
      ],
      inject: [
        VelocityReportProvider,
        BurndownReportProvider,
        CumulativeFlowReportProvider,
        EpicProgressReportProvider,
        IssueBreakdownReportProvider,
      ],
    },
    // O(1) dispatch registries (N×M → N+M).
    ReportProviderRegistry,
    ReportFormatterRegistry,
    // Export facade — consumed by the controller + the BullMQ processor.
    {
      provide: REPORT_EXPORTER_TOKEN,
      useClass: ReportExportService,
    },
  ],
})
export class ReportsModule {}

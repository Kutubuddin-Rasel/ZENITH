import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ExcelExportService } from './services/excel-export.service';
import { PdfExportService } from './services/pdf-export.service';
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
import { ProjectMember } from 'src/membership/entities/project-member.entity';
// S3 provider for scheduled report uploads
import { S3StorageProvider } from 'src/attachments/storage/providers/s3-storage.provider';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Issue, SprintIssue, Project, ProjectMember]),
    SprintsModule,
    AuthModule,
    RevisionsModule,
    MembershipModule,
    EmailModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ExcelExportService,
    PdfExportService,
    // Scheduled reports pipeline
    ScheduledReportsCronService,
    ScheduledReportsProcessor,
    S3StorageProvider,
  ],
})
export class ReportsModule {}

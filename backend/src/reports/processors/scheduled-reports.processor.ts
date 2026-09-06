import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EMAIL_DISPATCH_TOKEN } from '../../email';
import type { IEmailDispatch } from '../../email';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import {
  S3StorageProvider,
  StreamUploadOptions,
} from '../../attachments/storage/providers/s3-storage.provider';
import { REPORT_EXPORTER_TOKEN } from '../constants/reports.tokens';
import { ReportType, ReportFormat } from '../interfaces/reports.interfaces';
import type { IReportExporter } from '../interfaces/reports.interfaces';
import {
  SCHEDULED_REPORTS_QUEUE,
  IScheduledReportJob,
  buildReportS3Key,
} from '../interfaces/scheduled-report.interfaces';

// ---------------------------------------------------------------------------
// Strict Types (ZERO `any`)
// ---------------------------------------------------------------------------

/** Content type mapping for export formats */
const CONTENT_TYPE_MAP: Record<ReportFormat, string> = {
  [ReportFormat.PDF]: 'application/pdf',
  [ReportFormat.XLSX]:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  [ReportFormat.CSV]: 'text/csv',
};

/** Human-readable report type names for email subject */
const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  [ReportType.VELOCITY]: 'Velocity',
  [ReportType.BURNDOWN]: 'Burndown',
  [ReportType.CUMULATIVE_FLOW]: 'Cumulative Flow',
  [ReportType.EPIC_PROGRESS]: 'Epic Progress',
  [ReportType.ISSUE_BREAKDOWN]: 'Issue Breakdown',
};

/** Presigned URL expiry for report downloads (in hours) */
const REPORT_URL_EXPIRY_HOURS = 48;

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

/**
 * ScheduledReportsProcessor — BullMQ Worker for Report Generation
 *
 * ARCHITECTURE:
 * This processor runs in a BullMQ worker thread, completely decoupled
 * from the main API event loop. It:
 * 1. Receives job from `scheduled-reports-queue`
 * 2. Delegates to `REPORT_EXPORTER_TOKEN.export()` — the single O(1) facade
 *    that fetches the report (cached), shapes the canonical `ReportTable`, and
 *    renders the requested format to a streaming `PassThrough`.
 * 3. Pipes the stream directly to S3/MinIO via `uploadStream()`.
 *
 * TENANT CORRECTNESS:
 * The worker has NO request scope, so the tenant is passed EXPLICITLY via
 * `ctx.organizationId` (from the job payload) rather than read from CLS — the
 * seam introduced in `ReportRequestContext`/`ReportQueryService`.
 *
 * MEMORY SAFETY:
 * - Export stream: O(row_size) — PDFKit/ExcelJS/CSV stream incrementally
 * - S3 upload: O(5MB) — multipart chunked by @aws-sdk/lib-storage
 *
 * FAULT TOLERANCE:
 * - BullMQ retries: 3 attempts, exponential backoff (5s → 10s → 20s)
 * - Errors thrown from `process()` trigger automatic retry
 */
@Processor(SCHEDULED_REPORTS_QUEUE)
export class ScheduledReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledReportsProcessor.name);

  constructor(
    @Inject(REPORT_EXPORTER_TOKEN)
    private readonly exporter: IReportExporter,
    private readonly s3StorageProvider: S3StorageProvider,
    @Inject(EMAIL_DISPATCH_TOKEN)
    private readonly emailDispatch: IEmailDispatch,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly memberQuery: IProjectMemberQuery,
  ) {
    super();
  }

  /**
   * Process a scheduled report generation job.
   *
   * Flow:
   * 1. Extract job data
   * 2. Export the report stream via the O(1) facade (explicit tenant scope)
   * 3. Upload stream to S3/MinIO with tenant-scoped path
   * 4. Dispatch the distribution email to the Project Lead
   */
  async process(job: Job<IScheduledReportJob>): Promise<string> {
    const {
      projectId,
      organizationId,
      projectName,
      reportType,
      format,
      weekIdentifier,
    } = job.data;

    this.logger.log(
      `Processing scheduled report: ${reportType} (${format}) for project "${projectName}" [${weekIdentifier}]`,
    );

    try {
      // Step 1: Export stream — tenant resolved explicitly from the job payload
      // (no request/CLS scope inside the worker thread).
      const stream = await this.exporter.export(reportType, format, {
        projectId,
        userId: job.data.userId,
        organizationId,
      });

      // Step 2: Build S3 key
      const today = new Date().toISOString().split('T')[0];
      const s3Key = buildReportS3Key(organizationId, projectId, today, format);

      // Step 3: Upload stream to S3/MinIO
      const uploadOptions: StreamUploadOptions = {
        key: s3Key,
        contentType: CONTENT_TYPE_MAP[format],
        metadata: {
          'report-type': reportType,
          'project-id': projectId,
          'organization-id': organizationId,
          'week-identifier': weekIdentifier,
          'generated-at': new Date().toISOString(),
        },
      };

      const resultKey = await this.s3StorageProvider.uploadStream(
        stream,
        uploadOptions,
      );

      this.logger.log(
        `Scheduled report uploaded: ${resultKey} (project: ${projectName})`,
      );

      // Step 4: Dispatch email to Project Lead
      await this.dispatchReportEmail(
        projectId,
        projectName,
        reportType,
        resultKey,
      );

      return resultKey;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to generate scheduled report for project ${projectId}: ${msg}`,
      );
      // Re-throw to trigger BullMQ retry
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Email Distribution
  // ---------------------------------------------------------------------------

  /**
   * Look up the Project Lead and dispatch a report distribution email.
   *
   * ARCHITECTURE:
   * - Email dispatch is FIRE-AND-FORGET from this processor's perspective.
   *   The email job goes to the `email` queue with its own retry logic.
   * - If project lead lookup fails or email dispatch fails, we log a warning
   *   but do NOT throw — the report is already safely persisted in MinIO.
   * - The presigned URL is generated at EMAIL CONSUME TIME (in EmailProcessor),
   *   not here, to ensure the freshest possible 48h TTL.
   */
  private async dispatchReportEmail(
    projectId: string,
    projectName: string,
    reportType: ReportType,
    s3ObjectKey: string,
  ): Promise<void> {
    try {
      // Find the Project Lead through the ISP-segregated query surface.
      // listMembers returns a narrow user projection (id/name/email/
      // defaultRole only) — sensitive credential columns never leave
      // the membership boundary.
      const members = await this.memberQuery.listMembers(projectId);
      const leadMember = members.find(
        (m) => m.roleName === ProjectRole.PROJECT_LEAD,
      );

      if (!leadMember?.user.email) {
        this.logger.warn(
          `No Project Lead with email found for project ${projectId} — skipping email`,
        );
        return;
      }

      const reportLabel = REPORT_TYPE_LABELS[reportType] ?? reportType;

      await this.emailDispatch.sendReport({
        to: leadMember.user.email,
        projectName,
        reportType: reportLabel,
        s3ObjectKey,
        expiresInHours: REPORT_URL_EXPIRY_HOURS,
      });

      this.logger.log(
        `Report email dispatched to ${leadMember.user.email} for project "${projectName}"`,
      );
    } catch (err: unknown) {
      // Do NOT re-throw — report is already in MinIO.
      // Email failure should not fail the report generation job.
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(
        `Failed to dispatch report email for project ${projectId}: ${msg}`,
      );
    }
  }
}

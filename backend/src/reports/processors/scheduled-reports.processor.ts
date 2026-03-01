import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { PassThrough } from 'stream';
import { ReportsService } from '../reports.service';
import { ExcelExportService } from '../services/excel-export.service';
import { PdfExportService } from '../services/pdf-export.service';
import { EmailService } from '../../email/email.service';
import { ProjectMember } from '../../membership/entities/project-member.entity';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
    S3StorageProvider,
    StreamUploadOptions,
} from '../../attachments/storage/providers/s3-storage.provider';
import {
    SCHEDULED_REPORTS_QUEUE,
    IScheduledReportJob,
    ScheduledReportFormat,
    ScheduledReportType,
    buildReportS3Key,
} from '../interfaces/scheduled-report.interfaces';

// ---------------------------------------------------------------------------
// Strict Types (ZERO `any`)
// ---------------------------------------------------------------------------

/** Content type mapping for export formats */
const CONTENT_TYPE_MAP: Record<ScheduledReportFormat, string> = {
    [ScheduledReportFormat.PDF]: 'application/pdf',
    [ScheduledReportFormat.XLSX]:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Human-readable report type names for email subject */
const REPORT_TYPE_LABELS: Record<ScheduledReportType, string> = {
    [ScheduledReportType.VELOCITY]: 'Velocity',
    [ScheduledReportType.BURNDOWN]: 'Burndown',
    [ScheduledReportType.EPIC_PROGRESS]: 'Epic Progress',
    [ScheduledReportType.ISSUE_BREAKDOWN]: 'Issue Breakdown',
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
 * 2. Fetches report data via ReportsService (cached)
 * 3. Generates export stream via PDF/Excel service
 * 4. Pipes stream directly to S3/MinIO via `uploadStream()`
 *
 * MEMORY SAFETY:
 * - Report data: O(project_size) — bounded, cached
 * - Export stream: O(row_size) — PDFKit/ExcelJS stream incrementally
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
        private readonly reportsService: ReportsService,
        private readonly excelExportService: ExcelExportService,
        private readonly pdfExportService: PdfExportService,
        private readonly s3StorageProvider: S3StorageProvider,
        private readonly emailService: EmailService,
        @InjectRepository(ProjectMember)
        private readonly projectMemberRepo: Repository<ProjectMember>,
    ) {
        super();
    }

    /**
     * Process a scheduled report generation job.
     *
     * Flow:
     * 1. Extract job data
     * 2. Generate export stream for the specified report type + format
     * 3. Upload stream to S3/MinIO with tenant-scoped path
     * 4. Log the resulting S3 key (persistence to DB left for future entity)
     */
    async process(job: Job<IScheduledReportJob>): Promise<string> {
        const { projectId, organizationId, projectName, reportType, format, weekIdentifier } =
            job.data;

        this.logger.log(
            `Processing scheduled report: ${reportType} (${format}) for project "${projectName}" [${weekIdentifier}]`,
        );

        try {
            // Step 1: Generate export stream
            const stream = await this.generateExportStream(
                projectId,
                job.data.userId,
                reportType,
                format,
            );

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
        reportType: ScheduledReportType,
        s3ObjectKey: string,
    ): Promise<void> {
        try {
            // Find the Project Lead with their user email
            const leadMember = await this.projectMemberRepo
                .createQueryBuilder('pm')
                .innerJoinAndSelect('pm.user', 'user')
                .where('pm.projectId = :projectId', { projectId })
                .andWhere('pm.roleName = :role', { role: ProjectRole.PROJECT_LEAD })
                .getOne();

            if (!leadMember?.user?.email) {
                this.logger.warn(
                    `No Project Lead with email found for project ${projectId} — skipping email`,
                );
                return;
            }

            const reportLabel = REPORT_TYPE_LABELS[reportType] ?? reportType;

            await this.emailService.sendReportEmail(
                leadMember.user.email,
                projectName,
                reportLabel,
                s3ObjectKey,
                REPORT_URL_EXPIRY_HOURS,
            );

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

    // ---------------------------------------------------------------------------
    // Export Stream Generation
    // ---------------------------------------------------------------------------

    /**
     * Generate the appropriate export stream based on report type and format.
     *
     * Data is fetched via ReportsService (which uses caching).
     * Export services return PassThrough streams — O(row_size) memory.
     */
    private async generateExportStream(
        projectId: string,
        userId: string,
        reportType: ScheduledReportType,
        format: ScheduledReportFormat,
    ): Promise<PassThrough> {
        switch (reportType) {
            case ScheduledReportType.VELOCITY: {
                const data = await this.reportsService.getVelocity(projectId, userId);
                return format === ScheduledReportFormat.PDF
                    ? this.pdfExportService.generateVelocityPdf(data)
                    : this.excelExportService.generateVelocityExcel(data);
            }

            case ScheduledReportType.BURNDOWN: {
                const data = await this.reportsService.getBurndown(projectId, userId);
                return format === ScheduledReportFormat.PDF
                    ? this.pdfExportService.generateBurndownPdf(data)
                    : this.excelExportService.generateBurndownExcel(data);
            }

            case ScheduledReportType.EPIC_PROGRESS: {
                const data = await this.reportsService.getEpicProgress(
                    projectId,
                    userId,
                );
                return format === ScheduledReportFormat.PDF
                    ? this.pdfExportService.generateEpicProgressPdf(data)
                    : this.excelExportService.generateEpicProgressExcel(data);
            }

            case ScheduledReportType.ISSUE_BREAKDOWN: {
                const data = await this.reportsService.getIssueBreakdown(
                    projectId,
                    userId,
                );
                return format === ScheduledReportFormat.PDF
                    ? this.pdfExportService.generateIssueBreakdownPdf(data)
                    : this.excelExportService.generateIssueBreakdownExcel(data);
            }
        }
    }
}

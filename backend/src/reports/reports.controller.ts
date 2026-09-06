import {
  Controller,
  Get,
  Inject,
  Param,
  UseGuards,
  Request,
  Query,
  ParseUUIDPipe,
  Res,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportQueryService } from './services/report-query.service';
import { REPORT_EXPORTER_TOKEN } from './constants/reports.tokens';
import type {
  IReportExporter,
  ReportRequestContext,
} from './interfaces/reports.interfaces';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/auth/guards/permissions.guard';
import { RequirePermission } from 'src/auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request.interface';
import {
  ExportReportQueryDto,
  ReportFormat,
  ReportType,
} from './dto/export-report-query.dto';

/** Per-format HTTP wire metadata for the unified export endpoint. */
const EXPORT_WIRE: Record<ReportFormat, { contentType: string; ext: string }> =
  {
    [ReportFormat.PDF]: { contentType: 'application/pdf', ext: 'pdf' },
    [ReportFormat.XLSX]: {
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
    },
    [ReportFormat.CSV]: { contentType: 'text/csv', ext: 'csv' },
  };

/**
 * Reports HTTP boundary — ZERO business logic.
 *
 * The five read endpoints delegate to the CQRS read facade
 * (`ReportQueryService`) and return the raw domain shapes unchanged (no API
 * surface churn). The unified export endpoint resolves the request context,
 * sets the content headers, and hands off to `REPORT_EXPORTER_TOKEN`, whose
 * O(1) registry dispatch replaces the legacy `{type}×{format}` switch ladders.
 */
@Controller('projects/:projectId/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportQueryService,
    @Inject(REPORT_EXPORTER_TOKEN)
    private readonly exporter: IReportExporter,
  ) {}

  // ---------------------------------------------------------------------------
  // Read endpoints (raw JSON — unchanged API surface)
  // ---------------------------------------------------------------------------

  @Get('velocity')
  @RequirePermission('projects:view')
  getVelocity(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reports.getVelocity(this.context(projectId, req));
  }

  @Get('burndown')
  @RequirePermission('projects:view')
  getBurndown(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
    @Query('sprintId') sprintId?: string,
  ) {
    return this.reports.getBurndown(this.context(projectId, req, { sprintId }));
  }

  @Get('cumulative-flow')
  @RequirePermission('projects:view')
  getCumulativeFlow(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    return this.reports.getCumulativeFlow(
      this.context(projectId, req, { days }),
    );
  }

  @Get('epic-progress')
  @RequirePermission('projects:view')
  getEpicProgress(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reports.getEpicProgress(this.context(projectId, req));
  }

  @Get('issue-breakdown')
  @RequirePermission('projects:view')
  getIssueBreakdown(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reports.getIssueBreakdown(this.context(projectId, req));
  }

  // ---------------------------------------------------------------------------
  // Unified export endpoint (PDF / XLSX / CSV)
  // ---------------------------------------------------------------------------

  @Get(':type/export')
  @RequirePermission('projects:view')
  async exportReport(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('type') type: string,
    @Request() req: AuthenticatedRequest,
    @Query() query: ExportReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!Object.values(ReportType).includes(type as ReportType)) {
      throw new BadRequestException(
        `Invalid report type: ${type}. Must be one of: ${Object.values(
          ReportType,
        ).join(', ')}`,
      );
    }

    const reportType = type as ReportType;
    const wire = EXPORT_WIRE[query.format];
    const timestamp = new Date().toISOString().split('T')[0];

    res.set({
      'Content-Type': wire.contentType,
      'Content-Disposition': `attachment; filename="zenith-${reportType}-${timestamp}.${wire.ext}"`,
    });

    const stream = await this.exporter.export(
      reportType,
      query.format,
      this.context(projectId, req, {
        sprintId: query.sprintId,
        days: query.days,
      }),
    );
    return new StreamableFile(stream);
  }

  // ---------------------------------------------------------------------------
  // Request → context mapping (transport plumbing, not business logic)
  // ---------------------------------------------------------------------------

  private context(
    projectId: string,
    req: AuthenticatedRequest,
    params: { sprintId?: string; days?: string } = {},
  ): ReportRequestContext {
    return {
      projectId,
      userId: req.user.userId ?? req.user.id,
      organizationId: req.user.organizationId,
      sprintId: params.sprintId,
      days: params.days ? parseInt(params.days, 10) : undefined,
    };
  }
}

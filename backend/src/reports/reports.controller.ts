import {
  Controller,
  Get,
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
import { ReportsService } from './reports.service';
import { ExcelExportService } from './services/excel-export.service';
import { PdfExportService } from './services/pdf-export.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/auth/guards/permissions.guard';
import { RequirePermission } from 'src/auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request.interface';
import {
  ExportReportQueryDto,
  ExportFormat,
  ReportType,
} from './dto/export-report-query.dto';

@Controller('projects/:projectId/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly excelExportService: ExcelExportService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  // ---------------------------------------------------------------------------
  // Existing Report Endpoints (unchanged API surface)
  // ---------------------------------------------------------------------------

  @Get('velocity')
  @RequirePermission('projects:view')
  getVelocity(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportsService.getVelocity(projectId, req.user.userId);
  }

  @Get('burndown')
  @RequirePermission('projects:view')
  getBurndown(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
    @Query('sprintId') sprintId?: string,
  ) {
    return this.reportsService.getBurndown(projectId, req.user.id, sprintId);
  }

  @Get('cumulative-flow')
  @RequirePermission('projects:view')
  getCumulativeFlow(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    const daysNumber = days ? parseInt(days, 10) : 30;
    return this.reportsService.getCumulativeFlow(
      projectId,
      req.user.id,
      daysNumber,
    );
  }

  @Get('epic-progress')
  @RequirePermission('projects:view')
  getEpicProgress(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportsService.getEpicProgress(projectId, req.user.userId);
  }

  @Get('issue-breakdown')
  @RequirePermission('projects:view')
  getIssueBreakdown(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportsService.getIssueBreakdown(projectId, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // Export Endpoint
  // ---------------------------------------------------------------------------

  /**
   * Unified export endpoint — streams reports as XLSX or PDF.
   *
   * ARCHITECTURE:
   * 1. Fetch report data (cached via ReportsService)
   * 2. Generate export via ExcelExportService or PdfExportService
   * 3. Pipe the resulting stream directly to HTTP response
   *
   * MEMORY SAFETY:
   * - Excel: exceljs WorkbookWriter streams rows incrementally
   * - PDF: PDFKit streams pages incrementally
   * - Neither buffers the full file in memory
   *
   * CONNECTION SAFETY:
   * Report data is fetched → DB connection released → export
   * streaming operates on in-memory data. No live DB cursor.
   */
  @Get(':type/export')
  @RequirePermission('projects:view')
  async exportReport(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('type') type: string,
    @Request() req: AuthenticatedRequest,
    @Query() query: ExportReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Validate report type
    if (!Object.values(ReportType).includes(type as ReportType)) {
      throw new BadRequestException(
        `Invalid report type: ${type}. Must be one of: ${Object.values(ReportType).join(', ')}`,
      );
    }

    const reportType = type as ReportType;
    const userId = req.user.userId ?? req.user.id;
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `zenith-${reportType}-${timestamp}`;

    if (query.format === ExportFormat.XLSX) {
      return this.generateExcelExport(
        projectId,
        reportType,
        userId,
        filename,
        res,
        query,
      );
    }

    return this.generatePdfExport(
      projectId,
      reportType,
      userId,
      filename,
      res,
      query,
    );
  }

  // ---------------------------------------------------------------------------
  // Export Generators
  // ---------------------------------------------------------------------------

  private async generateExcelExport(
    projectId: string,
    reportType: ReportType,
    userId: string,
    filename: string,
    res: Response,
    query: ExportReportQueryDto,
  ): Promise<StreamableFile> {
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    });

    const stream = await this.getExcelStream(
      projectId,
      reportType,
      userId,
      query,
    );
    return new StreamableFile(stream);
  }

  private async generatePdfExport(
    projectId: string,
    reportType: ReportType,
    userId: string,
    filename: string,
    res: Response,
    query: ExportReportQueryDto,
  ): Promise<StreamableFile> {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
    });

    const stream = await this.getPdfStream(
      projectId,
      reportType,
      userId,
      query,
    );
    return new StreamableFile(stream);
  }

  private async getExcelStream(
    projectId: string,
    reportType: ReportType,
    userId: string,
    query: ExportReportQueryDto,
  ) {
    switch (reportType) {
      case ReportType.VELOCITY: {
        const data = await this.reportsService.getVelocity(projectId, userId);
        return this.excelExportService.generateVelocityExcel(data);
      }
      case ReportType.BURNDOWN: {
        const data = await this.reportsService.getBurndown(
          projectId,
          userId,
          query.sprintId,
        );
        return this.excelExportService.generateBurndownExcel(data);
      }
      case ReportType.EPIC_PROGRESS: {
        const data = await this.reportsService.getEpicProgress(
          projectId,
          userId,
        );
        return this.excelExportService.generateEpicProgressExcel(data);
      }
      case ReportType.ISSUE_BREAKDOWN: {
        const data = await this.reportsService.getIssueBreakdown(
          projectId,
          userId,
        );
        return this.excelExportService.generateIssueBreakdownExcel(data);
      }
      case ReportType.CUMULATIVE_FLOW: {
        const days = query.days ? parseInt(query.days, 10) : 30;
        const data = await this.reportsService.getCumulativeFlow(
          projectId,
          userId,
          days,
        );
        return this.excelExportService.generateCumulativeFlowExcel(
          data as Array<Record<string, number | string>>,
        );
      }
    }
  }

  private async getPdfStream(
    projectId: string,
    reportType: ReportType,
    userId: string,
    query: ExportReportQueryDto,
  ) {
    switch (reportType) {
      case ReportType.VELOCITY: {
        const data = await this.reportsService.getVelocity(projectId, userId);
        return this.pdfExportService.generateVelocityPdf(data);
      }
      case ReportType.BURNDOWN: {
        const data = await this.reportsService.getBurndown(
          projectId,
          userId,
          query.sprintId,
        );
        return this.pdfExportService.generateBurndownPdf(data);
      }
      case ReportType.EPIC_PROGRESS: {
        const data = await this.reportsService.getEpicProgress(
          projectId,
          userId,
        );
        return this.pdfExportService.generateEpicProgressPdf(data);
      }
      case ReportType.ISSUE_BREAKDOWN: {
        const data = await this.reportsService.getIssueBreakdown(
          projectId,
          userId,
        );
        return this.pdfExportService.generateIssueBreakdownPdf(data);
      }
      case ReportType.CUMULATIVE_FLOW: {
        const days = query.days ? parseInt(query.days, 10) : 30;
        const data = await this.reportsService.getCumulativeFlow(
          projectId,
          userId,
          days,
        );
        return this.pdfExportService.generateCumulativeFlowPdf(
          data as Array<Record<string, number | string>>,
        );
      }
    }
  }
}

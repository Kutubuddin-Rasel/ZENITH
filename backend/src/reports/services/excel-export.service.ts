import { Injectable, Logger } from '@nestjs/common';
import { PassThrough } from 'stream';
import ExcelJS from 'exceljs';
import {
  VelocityDataPoint,
  BurndownDataPoint,
  EpicProgressDataPoint,
  IssueBreakdownResult,
} from '../reports.service';

// ---------------------------------------------------------------------------
// Strict Interfaces (ZERO `any`)
// ---------------------------------------------------------------------------

/** Column definition for typed sheet generation */
interface ColumnDefinition {
  header: string;
  key: string;
  width: number;
}

/** Header style configuration */
interface HeaderStyle {
  fill: ExcelJS.Fill;
  font: Partial<ExcelJS.Font>;
  border: Partial<ExcelJS.Borders>;
  alignment: Partial<ExcelJS.Alignment>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRAND_COLOR = '1A56DB'; // Zenith blue
const HEADER_FONT_COLOR = 'FFFFFF';

const HEADER_STYLE: HeaderStyle = {
  fill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${BRAND_COLOR}` },
  },
  font: {
    name: 'Arial',
    bold: true,
    color: { argb: `FF${HEADER_FONT_COLOR}` },
    size: 11,
  },
  border: {
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
  },
  alignment: { horizontal: 'center', vertical: 'middle' },
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * ExcelExportService — Streaming Excel generation.
 *
 * ARCHITECTURE:
 * Uses `exceljs` streaming WorkbookWriter → PassThrough → HTTP Response.
 * Memory stays O(row_size), not O(total_file).
 *
 * - Freeze top row for header pinning
 * - Column auto-width via pre-defined widths
 * - Separate sheets for multi-section reports
 */
@Injectable()
export class ExcelExportService {
  private readonly logger = new Logger(ExcelExportService.name);

  /**
   * Generate velocity report as streaming XLSX.
   * Returns a PassThrough stream that can pipe directly to HTTP response.
   */
  async generateVelocityExcel(data: VelocityDataPoint[]): Promise<PassThrough> {
    const passThrough = new PassThrough();

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: passThrough,
      useStyles: true,
    });

    const sheet = workbook.addWorksheet('Velocity Report');

    // Define columns
    const columns: ColumnDefinition[] = [
      { header: 'Sprint', key: 'sprintName', width: 25 },
      { header: 'Committed Points', key: 'committedPoints', width: 20 },
      { header: 'Completed Points', key: 'completedPoints', width: 20 },
      { header: 'Start Date', key: 'sprintStart', width: 18 },
      { header: 'End Date', key: 'sprintEnd', width: 18 },
    ];

    sheet.columns = columns;

    // Apply header styling + freeze
    this.styleHeaderRow(sheet);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Stream rows
    for (const point of data) {
      sheet
        .addRow({
          sprintName: point.sprintName,
          committedPoints: point.committedPoints,
          completedPoints: point.completedPoints,
          sprintStart: new Date(point.sprintStart).toLocaleDateString(),
          sprintEnd: new Date(point.sprintEnd).toLocaleDateString(),
        })
        .commit();
    }

    sheet.commit();
    await workbook.commit();

    this.logger.log(`Velocity Excel generated (${data.length} rows)`);
    return passThrough;
  }

  /**
   * Generate burndown report as streaming XLSX.
   */
  async generateBurndownExcel(data: BurndownDataPoint[]): Promise<PassThrough> {
    const passThrough = new PassThrough();

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: passThrough,
      useStyles: true,
    });

    const sheet = workbook.addWorksheet('Burndown Report');

    sheet.columns = [
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Total Points', key: 'totalPoints', width: 18 },
      { header: 'Completed Points', key: 'completedPoints', width: 20 },
      { header: 'Remaining Points', key: 'remainingPoints', width: 20 },
    ];

    this.styleHeaderRow(sheet);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const point of data) {
      sheet
        .addRow({
          date: new Date(point.date).toLocaleDateString(),
          totalPoints: point.totalPoints,
          completedPoints: point.completedPoints,
          remainingPoints: point.remainingPoints,
        })
        .commit();
    }

    sheet.commit();
    await workbook.commit();

    this.logger.log(`Burndown Excel generated (${data.length} rows)`);
    return passThrough;
  }

  /**
   * Generate epic progress report as streaming XLSX.
   */
  async generateEpicProgressExcel(
    data: EpicProgressDataPoint[],
  ): Promise<PassThrough> {
    const passThrough = new PassThrough();

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: passThrough,
      useStyles: true,
    });

    const sheet = workbook.addWorksheet('Epic Progress');

    sheet.columns = [
      { header: 'Epic', key: 'epicTitle', width: 30 },
      { header: 'Status', key: 'epicStatus', width: 15 },
      { header: 'Total Stories', key: 'totalStories', width: 15 },
      { header: 'Completed', key: 'completedStories', width: 15 },
      { header: 'Story Points', key: 'totalStoryPoints', width: 18 },
      { header: 'Completed SP', key: 'completedStoryPoints', width: 18 },
      { header: 'Completion %', key: 'completionPercentage', width: 15 },
      { header: 'Due Date', key: 'dueDate', width: 18 },
    ];

    this.styleHeaderRow(sheet);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const epic of data) {
      sheet
        .addRow({
          epicTitle: epic.epicTitle,
          epicStatus: epic.epicStatus,
          totalStories: epic.totalStories,
          completedStories: epic.completedStories,
          totalStoryPoints: epic.totalStoryPoints,
          completedStoryPoints: epic.completedStoryPoints,
          completionPercentage: `${epic.completionPercentage.toFixed(1)}%`,
          dueDate: epic.dueDate
            ? new Date(epic.dueDate).toLocaleDateString()
            : 'No due date',
        })
        .commit();
    }

    sheet.commit();
    await workbook.commit();

    this.logger.log(`Epic Progress Excel generated (${data.length} rows)`);
    return passThrough;
  }

  /**
   * Generate issue breakdown as multi-sheet XLSX.
   * Creates a separate sheet for each breakdown dimension.
   */
  async generateIssueBreakdownExcel(
    data: IssueBreakdownResult,
  ): Promise<PassThrough> {
    const passThrough = new PassThrough();

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: passThrough,
      useStyles: true,
    });

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    this.styleHeaderRow(summarySheet);
    summarySheet.views = [{ state: 'frozen', ySplit: 1 }];
    summarySheet
      .addRow({ metric: 'Total Issues', value: data.totalIssues })
      .commit();
    summarySheet.commit();

    // Breakdown sheets
    const breakdowns: Array<{
      name: string;
      data: Record<string, number>;
      keyLabel: string;
    }> = [
      { name: 'By Type', data: data.typeBreakdown, keyLabel: 'Type' },
      {
        name: 'By Priority',
        data: data.priorityBreakdown,
        keyLabel: 'Priority',
      },
      { name: 'By Status', data: data.statusBreakdown, keyLabel: 'Status' },
      {
        name: 'By Assignee',
        data: data.assigneeBreakdown,
        keyLabel: 'Assignee',
      },
    ];

    for (const breakdown of breakdowns) {
      const sheet = workbook.addWorksheet(breakdown.name);
      sheet.columns = [
        { header: breakdown.keyLabel, key: 'key', width: 25 },
        { header: 'Count', key: 'count', width: 15 },
        { header: '% of Total', key: 'percentage', width: 15 },
      ];
      this.styleHeaderRow(sheet);
      sheet.views = [{ state: 'frozen', ySplit: 1 }];

      for (const [key, count] of Object.entries(breakdown.data)) {
        const percentage =
          data.totalIssues > 0
            ? ((count / data.totalIssues) * 100).toFixed(1)
            : '0.0';
        sheet.addRow({ key, count, percentage: `${percentage}%` }).commit();
      }
      sheet.commit();
    }

    await workbook.commit();

    this.logger.log('Issue Breakdown Excel generated (multi-sheet)');
    return passThrough;
  }

  /**
   * Generate cumulative flow diagram data as streaming XLSX.
   * Handles dynamic status columns from the CFD aggregation.
   */
  async generateCumulativeFlowExcel(
    data: Array<Record<string, number | string>>,
  ): Promise<PassThrough> {
    const passThrough = new PassThrough();

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: passThrough,
      useStyles: true,
    });

    const sheet = workbook.addWorksheet('Cumulative Flow');

    // Extract dynamic status columns from first row
    const statusKeys =
      data.length > 0 ? Object.keys(data[0]).filter((k) => k !== 'date') : [];

    const columns: ColumnDefinition[] = [
      { header: 'Date', key: 'date', width: 18 },
      ...statusKeys.map((status) => ({
        header: status,
        key: status,
        width: 18,
      })),
    ];

    sheet.columns = columns;
    this.styleHeaderRow(sheet);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const row of data) {
      const rowData: Record<string, string | number> = {
        date: String(row['date'] ?? ''),
      };
      for (const status of statusKeys) {
        rowData[status] = Number(row[status]) || 0;
      }
      sheet.addRow(rowData).commit();
    }

    sheet.commit();
    await workbook.commit();

    this.logger.log(`Cumulative Flow Excel generated (${data.length} rows)`);
    return passThrough;
  }

  // ---------------------------------------------------------------------------
  // Header Styling Helper
  // ---------------------------------------------------------------------------

  private styleHeaderRow(sheet: ExcelJS.Worksheet): void {
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = HEADER_STYLE.fill;
      cell.font = HEADER_STYLE.font;
      cell.border = HEADER_STYLE.border;
      cell.alignment = HEADER_STYLE.alignment;
    });
    headerRow.height = 24;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PassThrough } from 'stream';
import ExcelJS from 'exceljs';
import { ReportFormat } from '../interfaces/reports.interfaces';
import type {
  IReportFormatter,
  ReportTable,
  ReportColumn,
  ReportRow,
} from '../interfaces/reports.interfaces';

// ---------------------------------------------------------------------------
// Header style (lifted verbatim from the legacy ExcelExportService)
// ---------------------------------------------------------------------------

const BRAND_COLOR = '1A56DB';
const HEADER_FONT_COLOR = 'FFFFFF';

interface HeaderStyle {
  fill: ExcelJS.Fill;
  font: Partial<ExcelJS.Font>;
  border: Partial<ExcelJS.Borders>;
  alignment: Partial<ExcelJS.Alignment>;
}

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

// Excel sheet-name constraints: max 31 chars, none of * ? : / \ [ ]
const INVALID_SHEET_CHARS = /[*?:/\\[\]]/g;

/**
 * XLSX format port (isolates `exceljs`).
 *
 * The SOLE owner of the `exceljs` import in the reports module. Renders the
 * canonical `ReportTable` to a streaming workbook: the primary table becomes
 * the first sheet, each `ReportSection` becomes an additional sheet (the
 * multi-dimensional issue-breakdown report → one sheet per dimension).
 *
 * The `IReportFormatter.render` contract is synchronous, but ExcelJS finalizes
 * via an async `workbook.commit()`. We return the `PassThrough` immediately and
 * drive the write in the background (`void this.write(...)`); the stream is
 * ended by `workbook.commit()` and torn down with the error on failure. Memory
 * stays O(row) — the streaming `WorkbookWriter` flushes rows incrementally.
 */
@Injectable()
export class XlsxReportFormatter implements IReportFormatter {
  readonly format = ReportFormat.XLSX;
  private readonly logger = new Logger(XlsxReportFormatter.name);

  render(table: ReportTable): PassThrough {
    const passThrough = new PassThrough();
    void this.write(table, passThrough);
    return passThrough;
  }

  private async write(
    table: ReportTable,
    passThrough: PassThrough,
  ): Promise<void> {
    try {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: passThrough,
        useStyles: true,
      });

      this.writeSheet(workbook, table.title, table.columns, table.rows);
      for (const section of table.sections ?? []) {
        this.writeSheet(workbook, section.title, section.columns, section.rows);
      }

      await workbook.commit();
      this.logger.log(`XLSX rendered: "${table.title}"`);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`XLSX render failed: ${error.message}`);
      passThrough.destroy(error);
    }
  }

  private writeSheet(
    workbook: ExcelJS.stream.xlsx.WorkbookWriter,
    title: string,
    columns: readonly ReportColumn[],
    rows: readonly ReportRow[],
  ): void {
    const sheet = workbook.addWorksheet(this.sheetName(title));

    sheet.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.max(15, c.header.length + 2),
    }));

    this.styleHeaderRow(sheet);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const row of rows) {
      const data: Record<string, string | number> = {};
      for (const col of columns) {
        const value = row[col.key];
        data[col.key] = value === null || value === undefined ? '' : value;
      }
      sheet.addRow(data).commit();
    }

    sheet.commit();
  }

  private sheetName(title: string): string {
    return (
      title.replace(INVALID_SHEET_CHARS, ' ').trim().slice(0, 31) || 'Sheet'
    );
  }

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

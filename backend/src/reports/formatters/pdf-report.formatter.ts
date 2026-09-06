import { Injectable, Logger } from '@nestjs/common';
import { PassThrough } from 'stream';
import PDFDocument from 'pdfkit';
import { ReportFormat } from '../interfaces/reports.interfaces';
import type {
  IReportFormatter,
  ReportTable,
  ReportColumn,
  ReportRow,
  ReportCellValue,
} from '../interfaces/reports.interfaces';

// ---------------------------------------------------------------------------
// Branding constants (lifted verbatim from the legacy PdfExportService)
// ---------------------------------------------------------------------------

const BRAND_COLOR = '#1A56DB';
const HEADER_BG = '#1A56DB';
const HEADER_TEXT = '#FFFFFF';
const ROW_ALT_BG = '#F3F4F6';
const FONT_SIZE_TITLE = 20;
const FONT_SIZE_SUBTITLE = 12;
const FONT_SIZE_TABLE = 9;
const FONT_SIZE_HEADER = 10;
const TABLE_ROW_HEIGHT = 20;
const TABLE_HEADER_HEIGHT = 24;
const PAGE_MARGIN = 50;

/**
 * PDF format port (isolates `pdfkit`).
 *
 * The SOLE owner of the `pdfkit` import in the reports module. Unlike the
 * legacy `PdfExportService` (five hard-coded `generate*Pdf` methods, one per
 * report), this is ONE `render` over the canonical `ReportTable` — the
 * provider has already shaped + display-formatted every cell to a string/
 * number, so the formatter is purely presentational. Equal-width columns are
 * derived from the live page width, so it renders any column count in either
 * orientation (`meta.orientation === 'landscape'`).
 *
 * MEMORY: `PDFDocument.pipe(PassThrough)` streams pages incrementally — the
 * full document is never buffered.
 */
@Injectable()
export class PdfReportFormatter implements IReportFormatter {
  readonly format = ReportFormat.PDF;
  private readonly logger = new Logger(PdfReportFormatter.name);

  render(table: ReportTable): PassThrough {
    const passThrough = new PassThrough();
    const landscape = table.meta?.orientation === 'landscape';
    const doc = new PDFDocument({
      margin: PAGE_MARGIN,
      size: 'A4',
      layout: landscape ? 'landscape' : 'portrait',
    });

    doc.pipe(passThrough);

    this.renderHeader(doc, table.title);

    const summary = table.meta?.summary;
    if (summary) {
      doc
        .fontSize(FONT_SIZE_SUBTITLE)
        .fillColor('#374151')
        .text(summary, { align: 'left' });
      doc.moveDown(1);
    }

    this.renderTable(doc, table.columns, table.rows);

    for (const section of table.sections ?? []) {
      if (doc.y > doc.page.height - 150) {
        doc.addPage();
      } else {
        doc.moveDown(1);
      }
      doc
        .fontSize(14)
        .fillColor(BRAND_COLOR)
        .text(section.title, { underline: true });
      doc.moveDown(0.5);
      this.renderTable(doc, section.columns, section.rows);
    }

    this.renderFooter(doc);
    doc.end();

    this.logger.log(
      `PDF rendered: "${table.title}" (${table.rows.length} rows, ${
        table.sections?.length ?? 0
      } sections)`,
    );
    return passThrough;
  }

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------

  private renderHeader(doc: PDFKit.PDFDocument, title: string): void {
    doc.rect(0, 0, doc.page.width, 60).fill(BRAND_COLOR);

    doc
      .fontSize(FONT_SIZE_TITLE)
      .fillColor(HEADER_TEXT)
      .text('ZENITH', PAGE_MARGIN, 18, { align: 'left' });

    doc
      .fontSize(FONT_SIZE_SUBTITLE)
      .fillColor(HEADER_TEXT)
      .text(title, 0, 22, {
        align: 'right',
        width: doc.page.width - PAGE_MARGIN,
      });

    doc.moveDown(3);
    doc
      .fontSize(FONT_SIZE_SUBTITLE)
      .fillColor('#6B7280')
      .text(`Generated: ${new Date().toISOString()}`, PAGE_MARGIN, 75, {
        align: 'left',
      });
    doc.moveDown(1.5);
  }

  private renderTable(
    doc: PDFKit.PDFDocument,
    columns: readonly ReportColumn[],
    rows: readonly ReportRow[],
  ): void {
    if (columns.length === 0) return;

    const available = doc.page.width - 2 * PAGE_MARGIN;
    const colWidth = Math.floor(available / columns.length);
    const tableWidth = colWidth * columns.length;
    const startX = PAGE_MARGIN;
    let currentY = doc.y;

    // Header row
    doc.rect(startX, currentY, tableWidth, TABLE_HEADER_HEIGHT).fill(HEADER_BG);
    let xOffset = startX;
    for (const col of columns) {
      doc
        .fontSize(FONT_SIZE_HEADER)
        .fillColor(HEADER_TEXT)
        .text(col.header, xOffset + 4, currentY + 6, {
          width: colWidth - 8,
          align: 'left',
        });
      xOffset += colWidth;
    }
    currentY += TABLE_HEADER_HEIGHT;

    // Data rows (auto-paginating, alternating backgrounds)
    for (let i = 0; i < rows.length; i++) {
      if (currentY + TABLE_ROW_HEIGHT > doc.page.height - PAGE_MARGIN) {
        doc.addPage();
        currentY = PAGE_MARGIN;
      }

      if (i % 2 === 1) {
        doc
          .rect(startX, currentY, tableWidth, TABLE_ROW_HEIGHT)
          .fill(ROW_ALT_BG);
      }

      xOffset = startX;
      const row = rows[i];
      for (const col of columns) {
        doc
          .fontSize(FONT_SIZE_TABLE)
          .fillColor('#111827')
          .text(this.cell(row[col.key]), xOffset + 4, currentY + 5, {
            width: colWidth - 8,
            align: 'left',
          });
        xOffset += colWidth;
      }
      currentY += TABLE_ROW_HEIGHT;
    }

    doc.y = currentY;
  }

  private renderFooter(doc: PDFKit.PDFDocument): void {
    const bottomY = doc.page.height - 30;
    doc
      .fontSize(8)
      .fillColor('#9CA3AF')
      .text('Zenith Project Management — Confidential', PAGE_MARGIN, bottomY, {
        align: 'center',
        width: doc.page.width - 2 * PAGE_MARGIN,
      });
  }

  private cell(value: ReportCellValue | undefined): string {
    return value === null || value === undefined ? '' : String(value);
  }
}

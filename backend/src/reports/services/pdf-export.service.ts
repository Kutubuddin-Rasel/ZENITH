import { Injectable, Logger } from '@nestjs/common';
import { PassThrough } from 'stream';
import PDFDocument from 'pdfkit';
import {
    VelocityDataPoint,
    BurndownDataPoint,
    EpicProgressDataPoint,
    IssueBreakdownResult,
} from '../reports.service';

// ---------------------------------------------------------------------------
// Strict Interfaces (ZERO `any`)
// ---------------------------------------------------------------------------

/** Table column definition for PDF rendering */
interface PdfTableColumn {
    header: string;
    key: string;
    width: number;
}

/** Table row as string values */
type PdfTableRow = Record<string, string>;

// ---------------------------------------------------------------------------
// Constants
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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * PdfExportService — Memory-safe PDF generation via PDFKit.
 *
 * ARCHITECTURE:
 * PDFKit generates PDFs programmatically via a streaming API.
 * No Puppeteer/Chromium needed — pure Node.js, ~5-15MB per doc.
 *
 * Flow: PDFDocument.pipe(PassThrough) → pipe to HTTP Response
 *
 * BRANDING:
 * - Title with Zenith branding
 * - Generation timestamp + tenant context
 * - Professional table rendering with alternating rows
 */
@Injectable()
export class PdfExportService {
    private readonly logger = new Logger(PdfExportService.name);

    /**
     * Generate velocity report as streaming PDF.
     */
    async generateVelocityPdf(data: VelocityDataPoint[]): Promise<PassThrough> {
        const passThrough = new PassThrough();
        const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });

        doc.pipe(passThrough);

        this.renderHeader(doc, 'Velocity Report');

        const columns: PdfTableColumn[] = [
            { header: 'Sprint', key: 'sprintName', width: 150 },
            { header: 'Committed', key: 'committedPoints', width: 90 },
            { header: 'Completed', key: 'completedPoints', width: 90 },
            { header: 'Start', key: 'sprintStart', width: 90 },
            { header: 'End', key: 'sprintEnd', width: 90 },
        ];

        const rows: PdfTableRow[] = data.map((point) => ({
            sprintName: point.sprintName,
            committedPoints: String(point.committedPoints),
            completedPoints: String(point.completedPoints),
            sprintStart: new Date(point.sprintStart).toLocaleDateString(),
            sprintEnd: new Date(point.sprintEnd).toLocaleDateString(),
        }));

        this.renderTable(doc, columns, rows);
        this.renderFooter(doc);

        doc.end();

        this.logger.log(`Velocity PDF generated (${data.length} rows)`);
        return passThrough;
    }

    /**
     * Generate burndown report as streaming PDF.
     */
    async generateBurndownPdf(data: BurndownDataPoint[]): Promise<PassThrough> {
        const passThrough = new PassThrough();
        const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });

        doc.pipe(passThrough);

        this.renderHeader(doc, 'Burndown Report');

        const columns: PdfTableColumn[] = [
            { header: 'Date', key: 'date', width: 120 },
            { header: 'Total', key: 'totalPoints', width: 100 },
            { header: 'Completed', key: 'completedPoints', width: 100 },
            { header: 'Remaining', key: 'remainingPoints', width: 100 },
        ];

        const rows: PdfTableRow[] = data.map((point) => ({
            date: new Date(point.date).toLocaleDateString(),
            totalPoints: String(point.totalPoints),
            completedPoints: String(point.completedPoints),
            remainingPoints: String(point.remainingPoints),
        }));

        this.renderTable(doc, columns, rows);
        this.renderFooter(doc);

        doc.end();

        this.logger.log(`Burndown PDF generated (${data.length} rows)`);
        return passThrough;
    }

    /**
     * Generate epic progress report as streaming PDF.
     */
    async generateEpicProgressPdf(
        data: EpicProgressDataPoint[],
    ): Promise<PassThrough> {
        const passThrough = new PassThrough();
        const doc = new PDFDocument({
            margin: PAGE_MARGIN,
            size: 'A4',
            layout: 'landscape',
        });

        doc.pipe(passThrough);

        this.renderHeader(doc, 'Epic Progress Report');

        const columns: PdfTableColumn[] = [
            { header: 'Epic', key: 'epicTitle', width: 180 },
            { header: 'Status', key: 'epicStatus', width: 80 },
            { header: 'Stories', key: 'totalStories', width: 60 },
            { header: 'Done', key: 'completedStories', width: 60 },
            { header: 'SP Total', key: 'totalStoryPoints', width: 70 },
            { header: 'SP Done', key: 'completedStoryPoints', width: 70 },
            { header: '% Complete', key: 'completionPercentage', width: 80 },
        ];

        const rows: PdfTableRow[] = data.map((epic) => ({
            epicTitle: epic.epicTitle,
            epicStatus: epic.epicStatus,
            totalStories: String(epic.totalStories),
            completedStories: String(epic.completedStories),
            totalStoryPoints: String(epic.totalStoryPoints),
            completedStoryPoints: String(epic.completedStoryPoints),
            completionPercentage: `${epic.completionPercentage.toFixed(1)}%`,
        }));

        this.renderTable(doc, columns, rows);
        this.renderFooter(doc);

        doc.end();

        this.logger.log(`Epic Progress PDF generated (${data.length} rows)`);
        return passThrough;
    }

    /**
     * Generate issue breakdown report as streaming PDF.
     * Renders all breakdown dimensions as separate tables.
     */
    async generateIssueBreakdownPdf(
        data: IssueBreakdownResult,
    ): Promise<PassThrough> {
        const passThrough = new PassThrough();
        const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });

        doc.pipe(passThrough);

        this.renderHeader(doc, 'Issue Breakdown Report');

        // Summary
        doc
            .fontSize(FONT_SIZE_SUBTITLE)
            .fillColor('#374151')
            .text(`Total Issues: ${data.totalIssues}`, { align: 'left' });
        doc.moveDown(1);

        // Render each breakdown as a mini table
        const breakdowns: Array<{
            title: string;
            data: Record<string, number>;
            keyLabel: string;
        }> = [
                { title: 'By Type', data: data.typeBreakdown, keyLabel: 'Type' },
                { title: 'By Priority', data: data.priorityBreakdown, keyLabel: 'Priority' },
                { title: 'By Status', data: data.statusBreakdown, keyLabel: 'Status' },
                { title: 'By Assignee', data: data.assigneeBreakdown, keyLabel: 'Assignee' },
            ];

        for (const breakdown of breakdowns) {
            // Check if we need a new page
            if (doc.y > 650) {
                doc.addPage();
            }

            doc
                .fontSize(14)
                .fillColor(BRAND_COLOR)
                .text(breakdown.title, { underline: true });
            doc.moveDown(0.5);

            const columns: PdfTableColumn[] = [
                { header: breakdown.keyLabel, key: 'key', width: 200 },
                { header: 'Count', key: 'count', width: 100 },
                { header: '% of Total', key: 'percentage', width: 100 },
            ];

            const rows: PdfTableRow[] = Object.entries(breakdown.data).map(
                ([key, count]) => ({
                    key,
                    count: String(count),
                    percentage:
                        data.totalIssues > 0
                            ? `${((count / data.totalIssues) * 100).toFixed(1)}%`
                            : '0.0%',
                }),
            );

            this.renderTable(doc, columns, rows);
            doc.moveDown(1);
        }

        this.renderFooter(doc);

        doc.end();

        this.logger.log('Issue Breakdown PDF generated');
        return passThrough;
    }

    /**
     * Generate cumulative flow diagram data as streaming PDF.
     * Handles dynamic status columns from the CFD aggregation.
     */
    async generateCumulativeFlowPdf(
        data: Array<Record<string, number | string>>,
    ): Promise<PassThrough> {
        const passThrough = new PassThrough();
        const doc = new PDFDocument({
            margin: PAGE_MARGIN,
            size: 'A4',
            layout: 'landscape',
        });

        doc.pipe(passThrough);

        this.renderHeader(doc, 'Cumulative Flow Diagram');

        // Extract dynamic status columns
        const statusKeys =
            data.length > 0
                ? Object.keys(data[0]).filter((k) => k !== 'date')
                : [];

        const columns: PdfTableColumn[] = [
            { header: 'Date', key: 'date', width: 100 },
            ...statusKeys.map((status) => ({
                header: status,
                key: status,
                width: Math.floor(600 / (statusKeys.length || 1)),
            })),
        ];

        const rows: PdfTableRow[] = data.map((row) => {
            const pdfRow: PdfTableRow = {
                date: String(row['date'] ?? ''),
            };
            for (const status of statusKeys) {
                pdfRow[status] = String(Number(row[status]) || 0);
            }
            return pdfRow;
        });

        this.renderTable(doc, columns, rows);
        this.renderFooter(doc);

        doc.end();

        this.logger.log(`Cumulative Flow PDF generated (${data.length} rows)`);
        return passThrough;
    }

    // ---------------------------------------------------------------------------
    // Rendering Helpers
    // ---------------------------------------------------------------------------

    /**
     * Render document header with Zenith branding.
     */
    private renderHeader(doc: PDFKit.PDFDocument, title: string): void {
        // Brand bar
        doc
            .rect(0, 0, doc.page.width, 60)
            .fill(BRAND_COLOR);

        doc
            .fontSize(FONT_SIZE_TITLE)
            .fillColor(HEADER_TEXT)
            .text('ZENITH', PAGE_MARGIN, 18, { align: 'left' });

        doc
            .fontSize(FONT_SIZE_SUBTITLE)
            .fillColor(HEADER_TEXT)
            .text(title, 0, 22, { align: 'right', width: doc.page.width - PAGE_MARGIN });

        // Generation metadata
        doc.moveDown(3);
        doc
            .fontSize(FONT_SIZE_SUBTITLE)
            .fillColor('#6B7280')
            .text(`Generated: ${new Date().toISOString()}`, PAGE_MARGIN, 75, {
                align: 'left',
            });
        doc.moveDown(1.5);
    }

    /**
     * Render a data table with alternating row colors.
     */
    private renderTable(
        doc: PDFKit.PDFDocument,
        columns: PdfTableColumn[],
        rows: PdfTableRow[],
    ): void {
        const startX = PAGE_MARGIN;
        let currentY = doc.y;

        // Header row
        doc
            .rect(startX, currentY, columns.reduce((sum, c) => sum + c.width, 0), TABLE_HEADER_HEIGHT)
            .fill(HEADER_BG);

        let xOffset = startX;
        for (const col of columns) {
            doc
                .fontSize(FONT_SIZE_HEADER)
                .fillColor(HEADER_TEXT)
                .text(col.header, xOffset + 4, currentY + 6, {
                    width: col.width - 8,
                    align: 'left',
                });
            xOffset += col.width;
        }
        currentY += TABLE_HEADER_HEIGHT;

        // Data rows
        for (let i = 0; i < rows.length; i++) {
            // Auto-paginate
            if (currentY + TABLE_ROW_HEIGHT > doc.page.height - PAGE_MARGIN) {
                doc.addPage();
                currentY = PAGE_MARGIN;
            }

            // Alternating row background
            if (i % 2 === 1) {
                doc
                    .rect(
                        startX,
                        currentY,
                        columns.reduce((sum, c) => sum + c.width, 0),
                        TABLE_ROW_HEIGHT,
                    )
                    .fill(ROW_ALT_BG);
            }

            xOffset = startX;
            const row = rows[i];
            for (const col of columns) {
                doc
                    .fontSize(FONT_SIZE_TABLE)
                    .fillColor('#111827')
                    .text(row[col.key] ?? '', xOffset + 4, currentY + 5, {
                        width: col.width - 8,
                        align: 'left',
                    });
                xOffset += col.width;
            }
            currentY += TABLE_ROW_HEIGHT;
        }

        // Update doc Y position
        doc.y = currentY;
    }

    /**
     * Render document footer.
     */
    private renderFooter(doc: PDFKit.PDFDocument): void {
        const bottomY = doc.page.height - 30;
        doc
            .fontSize(8)
            .fillColor('#9CA3AF')
            .text(
                'Zenith Project Management — Confidential',
                PAGE_MARGIN,
                bottomY,
                { align: 'center', width: doc.page.width - 2 * PAGE_MARGIN },
            );
    }
}

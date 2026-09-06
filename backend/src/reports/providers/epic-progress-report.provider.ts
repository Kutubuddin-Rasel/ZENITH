import { Injectable } from '@nestjs/common';
import { ReportQueryService } from '../services/report-query.service';
import { ReportType } from '../interfaces/reports.interfaces';
import type {
  IReportDataProvider,
  ReportRequestContext,
  ReportTable,
  ReportRow,
} from '../interfaces/reports.interfaces';

/**
 * Epic-progress report → canonical `ReportTable`.
 *
 * The fuller (XLSX-parity) column set is the canonical one: it carries
 * "Completed SP" and "Due Date" in addition to the PDF's columns, so a single
 * view-model now drives all three formatters. Rendered landscape to fit the
 * eight columns. Percentages and the "No due date" sentinel are formatted here,
 * matching the legacy output byte-for-byte.
 */
@Injectable()
export class EpicProgressReportProvider implements IReportDataProvider {
  readonly reportType = ReportType.EPIC_PROGRESS;

  constructor(private readonly reports: ReportQueryService) {}

  async fetch(ctx: ReportRequestContext): Promise<ReportTable> {
    const data = await this.reports.getEpicProgress(ctx);

    const rows: ReportRow[] = data.map((epic) => ({
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
    }));

    return {
      title: 'Epic Progress Report',
      columns: [
        { key: 'epicTitle', header: 'Epic', kind: 'string' },
        { key: 'epicStatus', header: 'Status', kind: 'string' },
        { key: 'totalStories', header: 'Total Stories', kind: 'number' },
        { key: 'completedStories', header: 'Completed', kind: 'number' },
        { key: 'totalStoryPoints', header: 'Story Points', kind: 'number' },
        { key: 'completedStoryPoints', header: 'Completed SP', kind: 'number' },
        {
          key: 'completionPercentage',
          header: 'Completion %',
          kind: 'percent',
        },
        { key: 'dueDate', header: 'Due Date', kind: 'date' },
      ],
      rows,
      meta: { orientation: 'landscape' },
    };
  }
}

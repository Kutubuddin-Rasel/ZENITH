import { Injectable } from '@nestjs/common';
import { ReportQueryService } from '../services/report-query.service';
import { ReportType } from '../interfaces/reports.interfaces';
import type {
  IReportDataProvider,
  ReportRequestContext,
  ReportTable,
  ReportSection,
  ReportRow,
} from '../interfaces/reports.interfaces';

interface BreakdownDimension {
  readonly title: string;
  readonly keyLabel: string;
  readonly data: Record<string, number>;
}

/**
 * Issue-breakdown report → canonical multi-section `ReportTable`.
 *
 * The primary table is the summary (Total Issues); each of the four
 * dimensions (type / priority / status / assignee) becomes a `ReportSection`
 * → one XLSX sheet, one PDF sub-table, one CSV block. `meta.summary` carries
 * the legacy PDF subtitle line. Each row's "% of Total" is derived against the
 * total exactly as before (guarding divide-by-zero → "0.0%").
 */
@Injectable()
export class IssueBreakdownReportProvider implements IReportDataProvider {
  readonly reportType = ReportType.ISSUE_BREAKDOWN;

  constructor(private readonly reports: ReportQueryService) {}

  async fetch(ctx: ReportRequestContext): Promise<ReportTable> {
    const data = await this.reports.getIssueBreakdown(ctx);

    const dimensions: BreakdownDimension[] = [
      { title: 'By Type', keyLabel: 'Type', data: data.typeBreakdown },
      {
        title: 'By Priority',
        keyLabel: 'Priority',
        data: data.priorityBreakdown,
      },
      { title: 'By Status', keyLabel: 'Status', data: data.statusBreakdown },
      {
        title: 'By Assignee',
        keyLabel: 'Assignee',
        data: data.assigneeBreakdown,
      },
    ];

    const sections: ReportSection[] = dimensions.map((dimension) => ({
      title: dimension.title,
      columns: [
        { key: 'key', header: dimension.keyLabel, kind: 'string' },
        { key: 'count', header: 'Count', kind: 'number' },
        { key: 'percentage', header: '% of Total', kind: 'percent' },
      ],
      rows: Object.entries(dimension.data).map(
        ([key, count]): ReportRow => ({
          key,
          count,
          percentage: this.percentage(count, data.totalIssues),
        }),
      ),
    }));

    return {
      title: 'Issue Breakdown Report',
      columns: [
        { key: 'metric', header: 'Metric', kind: 'string' },
        { key: 'value', header: 'Value', kind: 'number' },
      ],
      rows: [{ metric: 'Total Issues', value: data.totalIssues }],
      sections,
      meta: { summary: `Total Issues: ${data.totalIssues}` },
    };
  }

  private percentage(count: number, total: number): string {
    return total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '0.0%';
  }
}

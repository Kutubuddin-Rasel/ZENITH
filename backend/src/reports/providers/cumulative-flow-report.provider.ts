import { Injectable } from '@nestjs/common';
import { ReportQueryService } from '../services/report-query.service';
import { ReportType } from '../interfaces/reports.interfaces';
import type {
  IReportDataProvider,
  ReportRequestContext,
  ReportTable,
  ReportColumn,
  ReportRow,
  CumulativeFlowPoint,
} from '../interfaces/reports.interfaces';

/**
 * Cumulative-flow report → canonical `ReportTable`.
 *
 * The status columns are dynamic (one per `IssueStatus` present in the
 * window), derived from the first point exactly as the legacy export did.
 * Rendered landscape via `meta.orientation` (the PDF formatter honours it;
 * XLSX/CSV ignore it) to fit the wide status matrix.
 */
@Injectable()
export class CumulativeFlowReportProvider implements IReportDataProvider {
  readonly reportType = ReportType.CUMULATIVE_FLOW;

  constructor(private readonly reports: ReportQueryService) {}

  async fetch(ctx: ReportRequestContext): Promise<ReportTable> {
    const data = await this.reports.getCumulativeFlow(ctx);

    const statusKeys =
      data.length > 0
        ? Object.keys(data[0]).filter((key) => key !== 'date')
        : [];

    const columns: ReportColumn[] = [
      { key: 'date', header: 'Date', kind: 'date' },
      ...statusKeys.map(
        (status): ReportColumn => ({
          key: status,
          header: status,
          kind: 'number',
        }),
      ),
    ];

    const rows: ReportRow[] = data.map((point: CumulativeFlowPoint) => {
      const row: Record<string, string | number> = {
        date: String(point.date ?? ''),
      };
      for (const status of statusKeys) {
        row[status] = Number(point[status]) || 0;
      }
      return row;
    });

    return {
      title: 'Cumulative Flow Diagram',
      columns,
      rows,
      meta: { orientation: 'landscape' },
    };
  }
}

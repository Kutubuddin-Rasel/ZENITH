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
 * Burndown report → canonical `ReportTable`.
 *
 * The read facade resolves the target sprint (explicit `ctx.sprintId` or the
 * active one) and returns its daily snapshots — no reports-owned repo is
 * involved, this is pure sprints-aggregate reuse.
 */
@Injectable()
export class BurndownReportProvider implements IReportDataProvider {
  readonly reportType = ReportType.BURNDOWN;

  constructor(private readonly reports: ReportQueryService) {}

  async fetch(ctx: ReportRequestContext): Promise<ReportTable> {
    const data = await this.reports.getBurndown(ctx);

    const rows: ReportRow[] = data.map((point) => ({
      date: new Date(point.date).toLocaleDateString(),
      totalPoints: point.totalPoints,
      completedPoints: point.completedPoints,
      remainingPoints: point.remainingPoints,
    }));

    return {
      title: 'Burndown Report',
      columns: [
        { key: 'date', header: 'Date', kind: 'date' },
        { key: 'totalPoints', header: 'Total Points', kind: 'number' },
        { key: 'completedPoints', header: 'Completed Points', kind: 'number' },
        { key: 'remainingPoints', header: 'Remaining Points', kind: 'number' },
      ],
      rows,
    };
  }
}

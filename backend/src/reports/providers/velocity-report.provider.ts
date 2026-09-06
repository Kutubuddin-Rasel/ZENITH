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
 * Velocity report → canonical `ReportTable`.
 *
 * One strategy in the `REPORT_DATA_PROVIDER_TOKEN` array; the registry keys it
 * by `reportType`. Pure presentation: the read facade has already fetched +
 * cached the domain rows (ALL completed sprints, with dates), so this only
 * shapes them into the shared view-model. Numbers stay numeric (XLSX renders
 * real numbers); dates are pre-formatted to match the legacy export verbatim.
 */
@Injectable()
export class VelocityReportProvider implements IReportDataProvider {
  readonly reportType = ReportType.VELOCITY;

  constructor(private readonly reports: ReportQueryService) {}

  async fetch(ctx: ReportRequestContext): Promise<ReportTable> {
    const data = await this.reports.getVelocity(ctx);

    const rows: ReportRow[] = data.map((point) => ({
      sprintName: point.sprintName,
      committedPoints: point.committedPoints,
      completedPoints: point.completedPoints,
      sprintStart: new Date(point.sprintStart).toLocaleDateString(),
      sprintEnd: new Date(point.sprintEnd).toLocaleDateString(),
    }));

    return {
      title: 'Velocity Report',
      columns: [
        { key: 'sprintName', header: 'Sprint', kind: 'string' },
        { key: 'committedPoints', header: 'Committed Points', kind: 'number' },
        { key: 'completedPoints', header: 'Completed Points', kind: 'number' },
        { key: 'sprintStart', header: 'Start Date', kind: 'date' },
        { key: 'sprintEnd', header: 'End Date', kind: 'date' },
      ],
      rows,
    };
  }
}

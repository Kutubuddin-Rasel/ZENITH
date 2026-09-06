import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { REPORT_FORMATTER_TOKEN } from '../constants/reports.tokens';
import { ReportFormat } from '../interfaces/reports.interfaces';
import type { IReportFormatter } from '../interfaces/reports.interfaces';

/**
 * O(1) format dispatch — the format half of the N×M → N+M win.
 *
 * Injects the multi-provided `IReportFormatter[]` and folds it into a
 * `Map<ReportFormat, IReportFormatter>`. Adding a format (CSV in Step 2) is now
 * a single new strategy registered under `REPORT_FORMATTER_TOKEN` — zero edits
 * to any provider or dispatch site (OCP).
 */
@Injectable()
export class ReportFormatterRegistry {
  private readonly byFormat: ReadonlyMap<ReportFormat, IReportFormatter>;

  constructor(
    @Inject(REPORT_FORMATTER_TOKEN)
    formatters: readonly IReportFormatter[],
  ) {
    const map = new Map<ReportFormat, IReportFormatter>();
    for (const formatter of formatters) {
      if (map.has(formatter.format)) {
        throw new Error(
          `Duplicate report formatter for format "${formatter.format}"`,
        );
      }
      map.set(formatter.format, formatter);
    }
    this.byFormat = map;
  }

  get(format: ReportFormat): IReportFormatter {
    const formatter = this.byFormat.get(format);
    if (!formatter) {
      throw new BadRequestException(`Unsupported report format: ${format}`);
    }
    return formatter;
  }

  has(format: ReportFormat): boolean {
    return this.byFormat.has(format);
  }
}

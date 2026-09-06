import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { REPORT_DATA_PROVIDER_TOKEN } from '../constants/reports.tokens';
import { ReportType } from '../interfaces/reports.interfaces';
import type { IReportDataProvider } from '../interfaces/reports.interfaces';

/**
 * O(1) report-type dispatch — the data half of the N×M → N+M win.
 *
 * Injects the multi-provided `IReportDataProvider[]` (the NestJS factory-array
 * idiom; there is no Angular `multi: true`) and folds it once, at construction,
 * into a `Map<ReportType, IReportDataProvider>`. Every export/read lookup is
 * then a constant-time `Map.get`, replacing the four hand-wired `switch`
 * ladders the legacy controller/processor duplicated.
 */
@Injectable()
export class ReportProviderRegistry {
  private readonly byType: ReadonlyMap<ReportType, IReportDataProvider>;

  constructor(
    @Inject(REPORT_DATA_PROVIDER_TOKEN)
    providers: readonly IReportDataProvider[],
  ) {
    const map = new Map<ReportType, IReportDataProvider>();
    for (const provider of providers) {
      if (map.has(provider.reportType)) {
        throw new Error(
          `Duplicate report data provider for type "${provider.reportType}"`,
        );
      }
      map.set(provider.reportType, provider);
    }
    this.byType = map;
  }

  get(type: ReportType): IReportDataProvider {
    const provider = this.byType.get(type);
    if (!provider) {
      throw new BadRequestException(`Unsupported report type: ${type}`);
    }
    return provider;
  }

  has(type: ReportType): boolean {
    return this.byType.has(type);
  }
}

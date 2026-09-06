import { Injectable, Logger } from '@nestjs/common';
import { PassThrough } from 'stream';
import { ReportProviderRegistry } from './report-provider.registry';
import { ReportFormatterRegistry } from './report-formatter.registry';
import { ReportType, ReportFormat } from '../interfaces/reports.interfaces';
import type {
  IReportExporter,
  ReportRequestContext,
} from '../interfaces/reports.interfaces';

/**
 * The export facade (`REPORT_EXPORTER_TOKEN`).
 *
 * Collapses the four duplicated `{type} × {format}` dispatch sites — the
 * controller's `getExcelStream`/`getPdfStream` and the processor's
 * `generateExportStream` — into a single O(1) expression:
 *
 *   `formatterRegistry.get(format).render(await providerRegistry.get(type).fetch(ctx))`
 *
 * The provider fetches + shapes the canonical `ReportTable`; the formatter
 * renders it to a streaming `PassThrough`. Adding a report type or a format is
 * now a single new strategy with zero edits here (OCP).
 */
@Injectable()
export class ReportExportService implements IReportExporter {
  private readonly logger = new Logger(ReportExportService.name);

  constructor(
    private readonly providers: ReportProviderRegistry,
    private readonly formatters: ReportFormatterRegistry,
  ) {}

  async export(
    type: ReportType,
    format: ReportFormat,
    ctx: ReportRequestContext,
  ): Promise<PassThrough> {
    const table = await this.providers.get(type).fetch(ctx);
    const stream = this.formatters.get(format).render(table);
    this.logger.log(`Exported "${type}" as ${format} ("${table.title}")`);
    return stream;
  }
}

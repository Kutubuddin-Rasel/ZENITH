import { PassThrough } from 'stream';
import { ReportExportService } from './report-export.service';
import { ReportProviderRegistry } from './report-provider.registry';
import { ReportFormatterRegistry } from './report-formatter.registry';
import { ReportType, ReportFormat } from '../interfaces/reports.interfaces';
import type {
  IReportDataProvider,
  IReportFormatter,
  ReportRequestContext,
  ReportTable,
} from '../interfaces/reports.interfaces';

describe('ReportExportService', () => {
  const ctx: ReportRequestContext = {
    projectId: 'p-1',
    userId: 'u-1',
    organizationId: 'org-1',
  };
  const table: ReportTable = {
    title: 'Velocity Report',
    columns: [{ key: 'a', header: 'A' }],
    rows: [{ a: 1 }],
  };

  it('pipes provider(type).fetch(ctx) into formatter(format).render(table)', async () => {
    const rendered = new PassThrough();

    const fetch = jest.fn().mockResolvedValue(table);
    const render = jest.fn().mockReturnValue(rendered);
    const providerGet = jest.fn().mockReturnValue({
      reportType: ReportType.VELOCITY,
      fetch,
    } satisfies IReportDataProvider);
    const formatterGet = jest.fn().mockReturnValue({
      format: ReportFormat.CSV,
      render,
    } satisfies IReportFormatter);

    const providers = {
      get: providerGet,
    } as unknown as ReportProviderRegistry;
    const formatters = {
      get: formatterGet,
    } as unknown as ReportFormatterRegistry;

    const service = new ReportExportService(providers, formatters);
    const stream = await service.export(
      ReportType.VELOCITY,
      ReportFormat.CSV,
      ctx,
    );

    expect(providerGet).toHaveBeenCalledWith(ReportType.VELOCITY);
    expect(fetch).toHaveBeenCalledWith(ctx);
    expect(formatterGet).toHaveBeenCalledWith(ReportFormat.CSV);
    expect(render).toHaveBeenCalledWith(table);
    expect(stream).toBe(rendered);
  });
});

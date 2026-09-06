import { BadRequestException } from '@nestjs/common';
import { ReportProviderRegistry } from './report-provider.registry';
import { ReportType } from '../interfaces/reports.interfaces';
import type {
  IReportDataProvider,
  ReportTable,
} from '../interfaces/reports.interfaces';

const EMPTY_TABLE: ReportTable = { title: '', columns: [], rows: [] };

const providerFor = (reportType: ReportType): IReportDataProvider => ({
  reportType,
  fetch: (): Promise<ReportTable> => Promise.resolve(EMPTY_TABLE),
});

describe('ReportProviderRegistry', () => {
  it('dispatches each report type to its provider in O(1)', () => {
    const velocity = providerFor(ReportType.VELOCITY);
    const burndown = providerFor(ReportType.BURNDOWN);

    const registry = new ReportProviderRegistry([velocity, burndown]);

    expect(registry.get(ReportType.VELOCITY)).toBe(velocity);
    expect(registry.get(ReportType.BURNDOWN)).toBe(burndown);
    expect(registry.has(ReportType.BURNDOWN)).toBe(true);
  });

  it('throws BadRequestException for an unregistered report type', () => {
    const registry = new ReportProviderRegistry([
      providerFor(ReportType.VELOCITY),
    ]);

    expect(registry.has(ReportType.EPIC_PROGRESS)).toBe(false);
    expect(() => registry.get(ReportType.EPIC_PROGRESS)).toThrow(
      BadRequestException,
    );
  });

  it('rejects duplicate strategies for the same report type', () => {
    expect(
      () =>
        new ReportProviderRegistry([
          providerFor(ReportType.VELOCITY),
          providerFor(ReportType.VELOCITY),
        ]),
    ).toThrow(/Duplicate report data provider/);
  });
});

import { BadRequestException } from '@nestjs/common';
import { PassThrough } from 'stream';
import { ReportFormatterRegistry } from './report-formatter.registry';
import { ReportFormat } from '../interfaces/reports.interfaces';
import type {
  IReportFormatter,
  ReportTable,
} from '../interfaces/reports.interfaces';

const formatterFor = (format: ReportFormat): IReportFormatter => ({
  format,
  render: (_table: ReportTable): PassThrough => new PassThrough(),
});

describe('ReportFormatterRegistry', () => {
  it('dispatches each format to its formatter in O(1)', () => {
    const pdf = formatterFor(ReportFormat.PDF);
    const xlsx = formatterFor(ReportFormat.XLSX);
    const csv = formatterFor(ReportFormat.CSV);

    const registry = new ReportFormatterRegistry([pdf, xlsx, csv]);

    expect(registry.get(ReportFormat.PDF)).toBe(pdf);
    expect(registry.get(ReportFormat.XLSX)).toBe(xlsx);
    expect(registry.get(ReportFormat.CSV)).toBe(csv);
    expect(registry.has(ReportFormat.CSV)).toBe(true);
  });

  it('throws BadRequestException for an unregistered format', () => {
    const registry = new ReportFormatterRegistry([
      formatterFor(ReportFormat.PDF),
    ]);

    expect(registry.has(ReportFormat.XLSX)).toBe(false);
    expect(() => registry.get(ReportFormat.XLSX)).toThrow(BadRequestException);
  });

  it('rejects duplicate strategies for the same format at construction', () => {
    expect(
      () =>
        new ReportFormatterRegistry([
          formatterFor(ReportFormat.PDF),
          formatterFor(ReportFormat.PDF),
        ]),
    ).toThrow(/Duplicate report formatter/);
  });
});

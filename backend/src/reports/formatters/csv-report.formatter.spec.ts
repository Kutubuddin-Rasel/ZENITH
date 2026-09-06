import { PassThrough } from 'stream';
import { CsvReportFormatter } from './csv-report.formatter';
import type { ReportTable } from '../interfaces/reports.interfaces';

const drain = (stream: PassThrough): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });

describe('CsvReportFormatter', () => {
  const formatter = new CsvReportFormatter();

  it('emits RFC-4180 rows: CRLF terminators, quote/comma/null handling', async () => {
    const table: ReportTable = {
      title: 'T',
      columns: [
        { key: 'a', header: 'A' },
        { key: 'b', header: 'B, comma' },
      ],
      rows: [
        { a: 'x', b: 'has "quote"' },
        { a: 1, b: null },
      ],
    };

    const csv = await drain(formatter.render(table));

    expect(csv).toBe('A,"B, comma"\r\n' + 'x,"has ""quote"""\r\n' + '1,\r\n');
  });

  it('renders each section as a titled, blank-line-separated block', async () => {
    const table: ReportTable = {
      title: 'Issue Breakdown Report',
      columns: [
        { key: 'metric', header: 'Metric' },
        { key: 'value', header: 'Value' },
      ],
      rows: [{ metric: 'Total Issues', value: 3 }],
      sections: [
        {
          title: 'By Type',
          columns: [
            { key: 'key', header: 'Type' },
            { key: 'count', header: 'Count' },
          ],
          rows: [{ key: 'bug', count: 2 }],
        },
      ],
    };

    const csv = await drain(formatter.render(table));

    expect(csv).toBe(
      'Metric,Value\r\n' +
        'Total Issues,3\r\n' +
        '\r\n' +
        'By Type\r\n' +
        'Type,Count\r\n' +
        'bug,2\r\n',
    );
  });
});
